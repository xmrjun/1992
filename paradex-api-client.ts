import axios from 'axios';
import { sign, getStarkKey } from '@scure/starknet';

/**
 * Paradex REST API 客户端
 * 用于交易功能（下单、查询等）
 * WebSocket 数据流由 paradex-ws-client.ts 提供
 */

export interface ParadexAPIConfig {
  l1Address: string;
  l2PrivateKey: string;
  l2Address?: string;  // 可选：如果提供则直接使用，否则派生
  testnet?: boolean;
}

export class ParadexAPIClient {
  private config: ParadexAPIConfig;
  private baseURL: string;
  private l2Address: string;
  private jwtToken?: string;

  constructor(config: ParadexAPIConfig) {
    this.config = config;
    this.testnet = config.testnet !== false;
    this.baseURL = this.testnet
      ? 'https://api.testnet.paradex.trade/v1'
      : 'https://api.prod.paradex.trade/v1';

    // 使用提供的 L2 地址或从私钥派生
    this.l2Address = config.l2Address || this.deriveL2Address(config.l2PrivateKey);
  }

  // 允许更新 L2 地址（从 WebSocket 获取）
  setL2Address(l2Address: string): void {
    this.l2Address = l2Address;
  }

  private deriveL2Address(privateKey: string): string {
    // 简化版本：直接使用 getStarkKey 获取公钥作为地址
    const pubKey = getStarkKey(privateKey);
    return '0x' + pubKey.toString(16).padStart(64, '0');
  }

  /**
   * 认证并获取 JWT Token
   */
  async authenticate(): Promise<void> {
    try {
      console.log('🔑 Paradex 认证中...');

      // 第一步：获取挑战消息
      const challengeResponse = await axios.post(`${this.baseURL}/auth/challenge`, {
        l1_address: this.config.l1Address
      });

      const challenge = challengeResponse.data.challenge;

      // 第二步：签名挑战
      const signature = sign(challenge, this.config.l2PrivateKey);

      // 第三步：获取 JWT
      const jwtResponse = await axios.post(`${this.baseURL}/auth`, {
        l1_address: this.config.l1Address,
        l2_address: this.l2Address,
        challenge: challenge,
        signature: {
          r: '0x' + signature.r.toString(16),
          s: '0x' + signature.s.toString(16)
        }
      });

      this.jwtToken = jwtResponse.data.jwt_token;
      console.log('✅ Paradex 认证成功');

    } catch (error: any) {
      console.error('❌ Paradex 认证失败:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 获取认证头
   */
  private getHeaders(): any {
    if (!this.jwtToken) {
      throw new Error('未认证，请先调用 authenticate()');
    }
    return {
      'Authorization': `Bearer ${this.jwtToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 获取账户信息
   */
  async getAccount(): Promise<any> {
    try {
      const response = await axios.get(`${this.baseURL}/account`, {
        headers: this.getHeaders()
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ 获取账户信息失败:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 获取余额
   */
  async fetchBalance(): Promise<any> {
    try {
      const account = await this.getAccount();
      const result: any = {};

      // 解析余额
      if (account.balances) {
        account.balances.forEach((balance: any) => {
          const currency = balance.token;
          result[currency] = {
            free: parseFloat(balance.available || 0),
            used: parseFloat(balance.locked || 0),
            total: parseFloat(balance.total || 0)
          };
        });
      }

      return result;
    } catch (error: any) {
      console.error('❌ 获取余额失败:', error.message);
      return {};
    }
  }

  /**
   * 获取持仓
   */
  async fetchPositions(market?: string): Promise<any[]> {
    try {
      const params = market ? { market } : {};
      const response = await axios.get(`${this.baseURL}/positions`, {
        headers: this.getHeaders(),
        params
      });

      const positions = response.data.results || [];
      return positions.map((pos: any) => ({
        symbol: pos.market,
        side: parseFloat(pos.size) > 0 ? 'long' : 'short',
        contracts: Math.abs(parseFloat(pos.size || 0)),
        contractSize: Math.abs(parseFloat(pos.size || 0)),
        positionAmt: parseFloat(pos.size || 0),
        entryPrice: parseFloat(pos.avg_entry_price || 0),
        markPrice: parseFloat(pos.mark_price || 0),
        unrealizedPnl: parseFloat(pos.unrealized_pnl || 0),
        leverage: parseFloat(pos.leverage || 1)
      }));
    } catch (error: any) {
      console.error('❌ 获取持仓失败:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * 下单
   */
  async createOrder(
    market: string,
    type: 'MARKET' | 'LIMIT',
    side: 'BUY' | 'SELL',
    size: string,
    price?: string,
    params?: any
  ): Promise<any> {
    try {
      const orderData: any = {
        market,
        type,
        side,
        size,
        ...params
      };

      if (type === 'LIMIT' && price) {
        orderData.limit_price = price;
      }

      const response = await axios.post(`${this.baseURL}/orders`, orderData, {
        headers: this.getHeaders()
      });

      const order = response.data;
      return {
        id: order.id,
        symbol: order.market,
        side: order.side.toLowerCase(),
        amount: parseFloat(order.size),
        price: order.limit_price ? parseFloat(order.limit_price) : null,
        status: order.status?.toLowerCase() || 'open',
        timestamp: order.created_at
      };
    } catch (error: any) {
      console.error('❌ 下单失败:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 下市价单
   */
  async createMarketOrder(
    market: string,
    side: 'buy' | 'sell',
    amount: number
  ): Promise<any> {
    return this.createOrder(
      market,
      'MARKET',
      side.toUpperCase() as 'BUY' | 'SELL',
      amount.toString()
    );
  }

  /**
   * 获取订单历史
   */
  async fetchOrders(market?: string, limit: number = 100): Promise<any[]> {
    try {
      const params: any = { limit };
      if (market) params.market = market;

      const response = await axios.get(`${this.baseURL}/orders`, {
        headers: this.getHeaders(),
        params
      });

      return response.data.results || [];
    } catch (error: any) {
      console.error('❌ 获取订单失败:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * 获取成交记录
   */
  async fetchMyTrades(market: string, limit: number = 100): Promise<any[]> {
    try {
      const response = await axios.get(`${this.baseURL}/fills`, {
        headers: this.getHeaders(),
        params: { market, limit }
      });

      const trades = response.data.results || [];
      return trades.map((trade: any) => ({
        id: trade.id,
        orderId: trade.order_id,
        symbol: trade.market,
        side: trade.side.toLowerCase(),
        amount: parseFloat(trade.size),
        price: parseFloat(trade.price),
        fee: {
          cost: parseFloat(trade.fee || 0),
          currency: trade.fee_token || 'USDC'
        },
        timestamp: new Date(trade.created_at).getTime(),
        time: new Date(trade.created_at).getTime()
      }));
    } catch (error: any) {
      console.error('❌ 获取成交记录失败:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
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

export default ParadexAPIClient;
