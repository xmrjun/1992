import axios from 'axios';
import {
  shortString,
  ec,
  typedData as starkTypedData,
  TypedData,
} from 'starknet';

/**
 * Paradex REST API 客户端 (基于官方TypeScript示例)
 * 使用 StarkNet TypedData 签名
 */

export interface ParadexAccountInfo {
  address: string;          // StarkNet L2 地址
  publicKey: string;        // StarkNet 公钥
  privateKey: string;       // StarkNet 私钥
  ethereumAccount: string;  // 以太坊 L1 地址
}

export interface ParadexAPIConfig {
  accountInfo: ParadexAccountInfo;
  testnet?: boolean;
}

interface SystemConfig {
  apiBaseUrl: string;
  starknet: {
    chainId: string;
  };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export class ParadexAPIClientV2 {
  private config: SystemConfig;
  private account: ParadexAccountInfo & { jwtToken?: string };

  constructor(apiConfig: ParadexAPIConfig) {
    const testnet = apiConfig.testnet !== false;

    this.config = {
      apiBaseUrl: testnet
        ? 'https://api.testnet.paradex.trade/v1'
        : 'https://api.prod.paradex.trade/v1',
      starknet: {
        chainId: shortString.encodeShortString('PRIVATE_SN_POTC_SEPOLIA')
      }
    };

    this.account = {
      ...apiConfig.accountInfo,
      jwtToken: undefined
    };
  }

  // ========== TypedData 构建 ==========

  private buildParadexDomain() {
    return {
      name: 'Paradex',
      chainId: this.config.starknet.chainId,
      version: '1',
    };
  }

  private buildOnboardingTypedData(): TypedData {
    return {
      domain: this.buildParadexDomain(),
      primaryType: 'Constant',
      types: {
        StarkNetDomain: [
          { name: 'name', type: 'felt' },
          { name: 'chainId', type: 'felt' },
          { name: 'version', type: 'felt' },
        ],
        Constant: [{ name: 'action', type: 'felt' }],
      },
      message: {
        action: 'Onboarding',
      },
    };
  }

  private buildAuthTypedData(message: Record<string, unknown>): TypedData {
    return {
      domain: this.buildParadexDomain(),
      primaryType: 'Request',
      types: {
        StarkNetDomain: [
          { name: 'name', type: 'felt' },
          { name: 'chainId', type: 'felt' },
          { name: 'version', type: 'felt' },
        ],
        Request: [
          { name: 'method', type: 'felt' },
          { name: 'path', type: 'felt' },
          { name: 'body', type: 'felt' },
          { name: 'timestamp', type: 'felt' },
          { name: 'expiration', type: 'felt' },
        ],
      },
      message,
    };
  }

  // ========== 签名函数 ==========

  private signatureFromTypedData(typedData: TypedData): string {
    const msgHash = starkTypedData.getMessageHash(typedData, this.account.address);
    const { r, s } = ec.starkCurve.sign(msgHash, this.account.privateKey);
    return JSON.stringify([r.toString(), s.toString()]);
  }

  private signOnboardingRequest(): string {
    const typedData = this.buildOnboardingTypedData();
    return this.signatureFromTypedData(typedData);
  }

  private signAuthRequest(): {
    signature: string;
    timestamp: number;
    expiration: number;
  } {
    const dateNow = new Date();
    const dateExpiration = new Date(dateNow.getTime() + SEVEN_DAYS_MS);
    const timestamp = Math.floor(dateNow.getTime() / 1000);
    const expiration = Math.floor(dateExpiration.getTime() / 1000);

    const message = {
      method: 'POST',
      path: '/v1/auth',
      body: '',
      timestamp,
      expiration,
    };

    const typedData = this.buildAuthTypedData(message);
    const signature = this.signatureFromTypedData(typedData);

    return { signature, timestamp, expiration };
  }

  // ========== API 调用 ==========

  async onboard(): Promise<void> {
    const timestamp = Date.now();
    const signature = this.signOnboardingRequest();

    const inputBody = JSON.stringify({
      public_key: this.account.publicKey,
    });

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'PARADEX-ETHEREUM-ACCOUNT': this.account.ethereumAccount,
      'PARADEX-STARKNET-ACCOUNT': this.account.address,
      'PARADEX-STARKNET-SIGNATURE': signature,
      'PARADEX-TIMESTAMP': timestamp.toString(),
    };

    try {
      await axios.post(`${this.config.apiBaseUrl}/onboarding`, inputBody, { headers });
      console.log('✅ Paradex Onboarding 成功');
    } catch (error: any) {
      console.error('❌ Paradex Onboarding 失败:', error.response?.data || error.message);
      throw error;
    }
  }

  async authenticate(): Promise<void> {
    const { signature, timestamp, expiration } = this.signAuthRequest();

    const headers = {
      'Accept': 'application/json',
      'PARADEX-STARKNET-ACCOUNT': this.account.address,
      'PARADEX-STARKNET-SIGNATURE': signature,
      'PARADEX-TIMESTAMP': timestamp.toString(),
      'PARADEX-SIGNATURE-EXPIRATION': expiration.toString(),
    };

    try {
      const response = await axios.post(
        `${this.config.apiBaseUrl}/auth`,
        {},
        { headers }
      );
      this.account.jwtToken = response.data.jwt_token;
      console.log('✅ Paradex 认证成功');
    } catch (error: any) {
      console.error('❌ Paradex 认证失败:', error.response?.data || error.message);
      throw error;
    }
  }

  async getAccount(): Promise<any> {
    if (!this.account.jwtToken) {
      throw new Error('未认证，请先调用 authenticate()');
    }

    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.account.jwtToken}`,
    };

    try {
      const response = await axios.get(`${this.config.apiBaseUrl}/account`, { headers });
      return response.data;
    } catch (error: any) {
      console.error('❌ 获取账户信息失败:', error.response?.data || error.message);
      throw error;
    }
  }

  async createMarketOrder(market: string, side: 'buy' | 'sell', amount: number): Promise<any> {
    if (!this.account.jwtToken) {
      throw new Error('未认证，请先调用 authenticate()');
    }

    const orderDetails = {
      market,
      side: side.toUpperCase(),
      type: 'MARKET',
      size: amount.toString(),
      instruction: 'GTC',
    };

    const timestamp = Date.now();
    const signature = this.signOrderRequest(orderDetails, timestamp);

    const inputBody = JSON.stringify({
      ...orderDetails,
      signature,
      signature_timestamp: timestamp,
    });

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.account.jwtToken}`,
    };

    try {
      const response = await axios.post(
        `${this.config.apiBaseUrl}/orders`,
        inputBody,
        { headers }
      );
      console.log('✅ Paradex 订单创建成功:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Paradex 下单失败:', error.response?.data || error.message);
      throw error;
    }
  }

  private signOrderRequest(orderDetails: Record<string, string>, timestamp: number): string {
    const sideForSigning = orderDetails.side === 'BUY' ? '1' : '2';
    const priceForSigning = orderDetails.price ? this.toQuantums(orderDetails.price, 8) : '0';
    const sizeForSigning = this.toQuantums(orderDetails.size, 8);
    const orderTypeForSigning = shortString.encodeShortString(orderDetails.type);
    const marketForSigning = shortString.encodeShortString(orderDetails.market);

    const message = {
      timestamp: Math.floor(timestamp / 1000),
      market: marketForSigning,
      side: sideForSigning,
      orderType: orderTypeForSigning,
      size: sizeForSigning,
      price: priceForSigning,
    };

    const typedData = this.buildOrderTypedData(message);
    return this.signatureFromTypedData(typedData);
  }

  private buildOrderTypedData(message: Record<string, unknown>): TypedData {
    return {
      domain: this.buildParadexDomain(),
      primaryType: 'Order',
      types: {
        StarkNetDomain: [
          { name: 'name', type: 'felt' },
          { name: 'chainId', type: 'felt' },
          { name: 'version', type: 'felt' },
        ],
        Order: [
          { name: 'timestamp', type: 'felt' },
          { name: 'market', type: 'felt' },
          { name: 'side', type: 'felt' },
          { name: 'orderType', type: 'felt' },
          { name: 'size', type: 'felt' },
          { name: 'price', type: 'felt' },
        ],
      },
      message,
    };
  }

  private toQuantums(value: string, decimals: number): string {
    const num = parseFloat(value);
    return Math.floor(num * Math.pow(10, decimals)).toString();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.onboard();
      await this.authenticate();
      const account = await this.getAccount();
      console.log('✅ Paradex API 连接正常');
      console.log(`   账户: ${account.account_id || 'N/A'}`);
      return true;
    } catch (error) {
      console.error('❌ Paradex API 连接失败');
      return false;
    }
  }
}

export default ParadexAPIClientV2;
