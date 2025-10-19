import crypto from 'crypto';
import axios from 'axios';
import http from 'http';
import https from 'https';
import WebSocket from 'ws';

// 🚀 极致速度优化：创建持久化HTTP连接池
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10
});

interface AsterConfig {
  apiKey: string;
  secret: string;
  baseURL?: string;
}

interface OrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string;
  reduceOnly?: boolean;
}

export class AsterAPI {
  private config: AsterConfig;
  private baseURL: string;
  private wsURL: string;

  // WebSocket相关
  private ws: WebSocket | null = null;
  private lastPrice: number = 0;
  private priceUpdateCallback?: (price: number) => void;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(config: AsterConfig) {
    this.config = config;
    this.baseURL = config.baseURL || 'https://fapi.asterdex.com';
    this.wsURL = 'wss://fstream.asterdx.com/ws/btcusdt@ticker';
  }

  private generateSignature(queryString: string): string {
    // 生成HMAC-SHA256签名
    return crypto.createHmac('sha256', this.config.secret).update(queryString).digest('hex');
  }

  private async makeRequest(method: string, endpoint: string, params: any = {}, signed: boolean = false): Promise<any> {
    // 添加时间戳 - 基于你原有的逻辑
    if (signed) {
      params['timestamp'] = Date.now();
      const queryString = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
      params['signature'] = this.generateSignature(queryString);
    }

    const headers: any = {};
    if (this.config.apiKey) {
      headers['X-MBX-APIKEY'] = this.config.apiKey;
    }

    const url = `${this.baseURL}${endpoint}`;

    try {
      let response;
      if (method.toUpperCase() === 'GET') {
        response = await axios.get(url, { params, headers });
      } else if (method.toUpperCase() === 'POST') {
        response = await axios.post(url, params, { headers });
      } else {
        response = await axios.request({ method, url, params, headers });
      }

      return response.data;
    } catch (error) {
      console.error(`AsterDX API请求失败:`, error.response?.data || error.message);
      throw error;
    }
  }

  // 获取账户信息 - 基于你原有的API逻辑
  async fetchBalance(): Promise<any> {
    try {
      const response = await this.makeRequest('GET', '/fapi/v2/account', {}, true);
      return this.parseBalance(response);
    } catch (error) {
      console.error('❌ 获取AsterDX余额失败:', error.message);
      return {};
    }
  }

  private parseBalance(response: any): any {
    const result: any = {};

    if (response.assets) {
      response.assets.forEach((asset: any) => {
        const currency = asset.asset;
        const total = parseFloat(asset.walletBalance || 0);
        const available = parseFloat(asset.availableBalance || 0);
        const used = total - available;

        result[currency] = {
          free: available,
          used: used,
          total: total
        };
      });
    }

    return result;
  }

  // 获取价格 - 基于你原有的API逻辑
  async fetchTicker(symbol: string = 'BTCUSDT'): Promise<any> {
    try {
      const response = await this.makeRequest('GET', '/fapi/v1/ticker/24hr', { symbol });
      return response;
    } catch (error) {
      console.error('❌ 获取AsterDX价格失败:', error.message);
      throw error;
    }
  }

  // 下单 - 基于你原有的API逻辑
  async createOrder(symbol: string, type: 'limit' | 'market', side: 'buy' | 'sell', amount: number, price?: number, params?: any): Promise<any> {
    try {
      const orderParams: any = {
        symbol: symbol,
        side: side.toUpperCase(),
        type: type.toUpperCase(),
        quantity: amount.toString()
      };

      if (price) {
        orderParams.price = price.toString();
        orderParams.timeInForce = 'GTC';
      }

      if (params?.reduceOnly) {
        orderParams.reduceOnly = 'true';
      }

      const response = await this.makeRequest('POST', '/fapi/v1/order', orderParams, true);

      // 格式化返回结果
      return {
        id: response.orderId,
        symbol: response.symbol,
        side: response.side.toLowerCase(),
        amount: parseFloat(response.origQty || response.quantity),
        price: response.price ? parseFloat(response.price) : null,
        status: response.status?.toLowerCase() || 'open'
      };
    } catch (error) {
      console.error('❌ AsterDX下单失败:', error.message);
      throw error;
    }
  }

  // 下市价单
  async createMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, price?: number, params?: any, timestamp?: number): Promise<any> {
    const orderParams: any = {
      symbol: symbol,
      side: side.toUpperCase(),
      type: 'MARKET',
      quantity: amount.toString(),
      timestamp: (timestamp || Date.now()),  // 保持数字格式
      recvWindow: 10000  // 增加到10秒容差
    };

    if (params?.reduceOnly) {
      orderParams.reduceOnly = 'true';
    }

    // 🔧 修复：按字母顺序排序参数，确保签名一致性
    const orderQueryString = Object.keys(orderParams)
      .sort()  // 关键修复：参数排序
      .map(key => `${key}=${orderParams[key]}`)
      .join('&');

    const signature = this.generateSignature(orderQueryString);

    const response = await axios.post(`${this.baseURL}/fapi/v1/order`,
      `${orderQueryString}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': this.config.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      httpAgent: httpAgent,  // 🚀 使用连接池
      httpsAgent: httpsAgent,
      timeout: 1500  // 🚀 1.5秒超时
    });

    const data = response.data;

    // 格式化为CCXT兼容格式
    return {
      id: data.orderId,
      symbol: data.symbol,
      side: data.side.toLowerCase(),
      amount: parseFloat(data.origQty),
      price: data.price ? parseFloat(data.price) : null,
      status: data.status.toLowerCase()
    };
  }

  // 获取持仓
  async fetchPositions(): Promise<any[]> {
    try {
      const params = {
        timestamp: Date.now().toString()
      };

      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

      const signature = this.generateSignature(queryString);

      const response = await axios.get(`${this.baseURL}/fapi/v2/positionRisk?${queryString}&signature=${signature}`, {
        headers: {
          'X-MBX-APIKEY': this.config.apiKey
        },
        httpAgent: httpAgent,  // 🚀 使用连接池
        httpsAgent: httpsAgent,
        timeout: 1500
      });

      const positions = response.data;

      // 过滤出有持仓的
      return positions.filter((pos: any) => parseFloat(pos.positionAmt) !== 0).map((pos: any) => ({
        symbol: pos.symbol,
        side: parseFloat(pos.positionAmt) > 0 ? 'long' : 'short',
        contracts: Math.abs(parseFloat(pos.positionAmt)),
        contractSize: Math.abs(parseFloat(pos.positionAmt)),
        positionAmt: parseFloat(pos.positionAmt),
        notional: Math.abs(parseFloat(pos.notional)),
        entryPrice: parseFloat(pos.entryPrice),
        markPrice: parseFloat(pos.markPrice),
        unrealizedPnl: parseFloat(pos.unRealizedProfit),
        percentage: pos.percentage,
        leverage: pos.leverage
      }));

    } catch (error) {
      console.error('❌ 获取AsterDx持仓失败:', error.response?.data || error.message);
      return [];
    }
  }

  // 获取账户余额
  async fetchBalance(): Promise<any> {
    try {
      const params = {
        timestamp: Date.now().toString()
      };

      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

      const signature = this.generateSignature(queryString);

      const response = await axios.get(`${this.baseURL}/fapi/v2/balance?${queryString}&signature=${signature}`, {
        headers: {
          'X-MBX-APIKEY': this.config.apiKey
        },
        httpAgent: httpAgent,  // 🚀 使用连接池
        httpsAgent: httpsAgent,
        timeout: 1500
      });

      const balances = response.data;
      const result: any = {};

      balances.forEach((balance: any) => {
        result[balance.asset] = {
          free: parseFloat(balance.availableBalance),
          used: parseFloat(balance.balance) - parseFloat(balance.availableBalance),
          total: parseFloat(balance.balance)
        };
      });

      return result;

    } catch (error) {
      console.error('❌ 获取AsterDx余额失败:', error.response?.data || error.message);
      return {};
    }
  }

  // 获取成交记录
  async fetchMyTrades(symbol: string, limit: number = 100, since?: number): Promise<any[]> {
    try {
      const params: any = {
        symbol: symbol,
        limit: limit.toString(),
        timestamp: Date.now().toString()
      };

      if (since) {
        params.startTime = since.toString();
      }

      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

      const signature = this.generateSignature(queryString);

      const response = await axios.get(`${this.baseURL}/fapi/v1/userTrades?${queryString}&signature=${signature}`, {
        headers: {
          'X-MBX-APIKEY': this.config.apiKey
        },
        httpAgent: httpAgent,  // 🚀 使用连接池
        httpsAgent: httpsAgent,
        timeout: 1500
      });

      const trades = response.data;

      // 格式化为统一格式
      return trades.map((trade: any) => ({
        id: trade.id,
        orderId: trade.orderId,
        symbol: trade.symbol,
        side: trade.buyer ? 'buy' : 'sell',
        amount: parseFloat(trade.qty),
        price: parseFloat(trade.price),
        fee: {
          cost: parseFloat(trade.commission),
          currency: trade.commissionAsset
        },
        timestamp: parseInt(trade.time),
        time: parseInt(trade.time),
        commission: parseFloat(trade.commission),
        isBuyer: trade.buyer
      }));

    } catch (error) {
      console.error('❌ 获取AsterDx成交记录失败:', error.response?.data || error.message);
      return [];
    }
  }

  // 启动WebSocket连接
  async connectWebSocket(callback?: (price: number) => void): Promise<void> {
    try {
      this.priceUpdateCallback = callback;

      console.log('🔌 连接AsterDX WebSocket...');
      this.ws = new WebSocket(this.wsURL);

      this.ws.on('open', () => {
        console.log('✅ AsterDX WebSocket连接成功');
      });

      this.ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);

          // 处理价格更新消息
          if (message.s === 'BTCUSDT' && message.c) {
            const price = parseFloat(message.c);

            if (price > 0) {
              this.lastPrice = price;
              console.log(`📊 AsterDX价格更新: ${price.toFixed(2)} USDT`);

              if (this.priceUpdateCallback) {
                this.priceUpdateCallback(price);
              }
            }
          }
        } catch (error) {
          // 静默处理JSON解析错误
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ AsterDX WebSocket错误:', error.message);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`🔌 AsterDX WebSocket连接关闭: ${code} - ${reason}`);

        // 5秒后自动重连
        this.reconnectTimer = setTimeout(() => {
          console.log('🔄 AsterDX WebSocket重连中...');
          this.connectWebSocket(callback);
        }, 5000);
      });

    } catch (error) {
      console.error('❌ AsterDX WebSocket连接失败:', error);
    }
  }

  // 关闭WebSocket连接
  async closeWebSocket(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
      console.log('🔌 AsterDX WebSocket已关闭');
    }
  }

  // 获取最新价格（同步）
  getLastPrice(): number {
    return this.lastPrice;
  }

  // 检查WebSocket连接状态
  isWebSocketConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export default AsterAPI;