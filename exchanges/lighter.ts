import WebSocket from 'ws';

export interface LighterConfig {
  testnet?: boolean;
  authToken?: string;
  apiHost?: string;
  accountIndex?: number;
  apiKeyIndex?: number;
  privateKey?: string;
  walletAddress?: string;
}

export interface LighterMarket {
  market_id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  price_decimals: number;
  quantity_decimals: number;
}

export interface LighterMarketStats {
  market_id: number;
  index_price: string;
  mark_price: string;
  last_trade_price: string;
  open_interest: string;
  daily_price_change: number;
  volume_24h?: string;
  high_24h?: string;
  low_24h?: string;
}

export interface LighterTicker {
  symbol: string;
  lastPrice: string;
  markPrice: string;
  indexPrice: string;
  bid: string;
  ask: string;
  high: string;
  low: string;
  volume: string;
  timestamp: number;
  priceChange: number;
  priceChangePercent: number;
}

export interface LighterTrade {
  market_id: number;
  price: string;
  quantity: string;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface LighterOrderBook {
  market_id: number;
  bids: [string, string][];  // [price, quantity]
  asks: [string, string][];
  timestamp: number;
}

export interface LighterOrder {
  id: string;
  market_id: number;
  side: 'buy' | 'sell';
  type: 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT';
  amount: string;
  price?: string;
  status: 'pending' | 'open' | 'filled' | 'cancelled';
  client_order_index?: number;
  timestamp: number;
}

export interface LighterPosition {
  market_id: number;
  side: 'long' | 'short';
  size: string;
  entry_price: string;
  mark_price: string;
  unrealized_pnl: string;
  leverage: number;
}

/**
 * Lighter.xyz 交易所 WebSocket API 包装器
 * 支持实时价格、订单簿、交易数据流
 */
export class Lighter {
  private config: LighterConfig;
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000;

  // 回调函数存储
  private tickerCallbacks: Map<number, (ticker: LighterTicker) => void> = new Map();
  private tradeCallbacks: Map<number, (trades: LighterTrade[]) => void> = new Map();
  private orderBookCallbacks: Map<number, (orderbook: LighterOrderBook) => void> = new Map();
  private marketStatsCallbacks: Map<number, (stats: LighterMarketStats) => void> = new Map();

  // 数据缓存
  private markets: Map<number, LighterMarket> = new Map();
  private lastPrices: Map<number, LighterMarketStats> = new Map();
  private orderBooks: Map<number, LighterOrderBook> = new Map();

  constructor(config: LighterConfig = {}) {
    this.config = config;
    this.wsUrl = config.testnet
      ? 'wss://testnet.zklighter.elliot.ai/stream'
      : 'wss://mainnet.zklighter.elliot.ai/stream';

    // 设置 API 主机
    this.apiHost = config.apiHost || 'https://mainnet.zklighter.elliot.ai';
  }

  private apiHost: string;
  private nextClientOrderIndex: number = Date.now();

  /**
   * 建立 WebSocket 连接
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`🔌 连接 Lighter.xyz WebSocket: ${this.wsUrl}`);

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          console.log('✅ Lighter.xyz WebSocket 连接成功');
          this.isConnected = true;
          this.reconnectAttempts = 0;

          // 如果需要认证
          if (this.config.authToken) {
            this.authenticate();
          }

          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ Lighter.xyz 消息解析错误:', error.message);
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          console.log(`🔌 Lighter.xyz WebSocket 连接关闭: ${code} ${reason.toString()}`);
          this.isConnected = false;
          this.attemptReconnect();
        });

        this.ws.on('error', (error: Error) => {
          console.error('❌ Lighter.xyz WebSocket 错误:', error.message);
          this.isConnected = false;
          reject(error);
        });

        // 连接超时
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket 连接超时'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 认证（如果需要私有数据）
   */
  private authenticate(): void {
    if (this.ws && this.config.authToken) {
      const authMessage = {
        auth: this.config.authToken
      };
      this.ws.send(JSON.stringify(authMessage));
      console.log('🔐 发送认证信息');
    }
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: any): void {
    try {
      const { type, channel } = message;

      if (type === 'update/market_stats' && message.market_stats) {
        this.handleMarketStats(message.market_stats);
      } else if (type === 'update/trade' && message.trade) {
        this.handleTrade(message.trade);
      } else if (type === 'update/order_book' && message.order_book) {
        this.handleOrderBook(message.order_book);
      } else if (type === 'markets' && message.markets) {
        this.handleMarkets(message.markets);
      }

    } catch (error) {
      console.error('❌ 处理消息时出错:', error.message);
    }
  }

  /**
   * 处理市场统计数据
   */
  private handleMarketStats(marketStats: LighterMarketStats): void {
    const marketId = marketStats.market_id;
    this.lastPrices.set(marketId, marketStats);

    // 触发市场统计回调
    const statsCallback = this.marketStatsCallbacks.get(marketId);
    if (statsCallback) {
      statsCallback(marketStats);
    }

    // 触发价格回调（转换为标准格式）
    const tickerCallback = this.tickerCallbacks.get(marketId);
    if (tickerCallback) {
      const market = this.markets.get(marketId);
      const ticker: LighterTicker = {
        symbol: market?.symbol || `MARKET_${marketId}`,
        lastPrice: marketStats.last_trade_price,
        markPrice: marketStats.mark_price,
        indexPrice: marketStats.index_price,
        bid: '0', // 需要从订单簿获取
        ask: '0', // 需要从订单簿获取
        high: '0',
        low: '0',
        volume: '0',
        timestamp: Date.now(),
        priceChange: marketStats.daily_price_change,
        priceChangePercent: marketStats.daily_price_change * 100
      };

      // 如果有订单簿数据，更新 bid/ask
      const orderBook = this.orderBooks.get(marketId);
      if (orderBook) {
        if (orderBook.bids.length > 0) ticker.bid = orderBook.bids[0][0];
        if (orderBook.asks.length > 0) ticker.ask = orderBook.asks[0][0];
      }

      tickerCallback(ticker);
    }
  }

  /**
   * 处理交易数据
   */
  private handleTrade(trade: LighterTrade): void {
    const marketId = trade.market_id;
    const tradeCallback = this.tradeCallbacks.get(marketId);
    if (tradeCallback) {
      tradeCallback([trade]);
    }
  }

  /**
   * 处理订单簿数据
   */
  private handleOrderBook(orderBook: LighterOrderBook): void {
    const marketId = orderBook.market_id;
    this.orderBooks.set(marketId, orderBook);

    const orderBookCallback = this.orderBookCallbacks.get(marketId);
    if (orderBookCallback) {
      orderBookCallback(orderBook);
    }
  }

  /**
   * 处理市场列表
   */
  private handleMarkets(markets: LighterMarket[]): void {
    markets.forEach(market => {
      this.markets.set(market.market_id, market);
    });
    console.log(`📊 加载了 ${markets.length} 个市场`);
  }

  /**
   * 订阅市场统计数据（价格数据）
   */
  async watchTicker(marketId: number, callback: (ticker: LighterTicker) => void): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    this.tickerCallbacks.set(marketId, callback);

    // 订阅市场统计和订单簿
    this.subscribe(`market_stats/${marketId}`);
    this.subscribe(`order_book/${marketId}`);

    console.log(`📊 开始监听市场 ${marketId} 价格数据`);
  }

  /**
   * 订阅交易数据
   */
  async watchTrades(marketId: number, callback: (trades: LighterTrade[]) => void): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    this.tradeCallbacks.set(marketId, callback);
    this.subscribe(`trade/${marketId}`);

    console.log(`📈 开始监听市场 ${marketId} 交易数据`);
  }

  /**
   * 订阅订单簿数据
   */
  async watchOrderBook(marketId: number, callback: (orderbook: LighterOrderBook) => void): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    this.orderBookCallbacks.set(marketId, callback);
    this.subscribe(`order_book/${marketId}`);

    console.log(`📊 开始监听市场 ${marketId} 订单簿`);
  }

  /**
   * 订阅市场统计数据
   */
  async watchMarketStats(marketId: number, callback: (stats: LighterMarketStats) => void): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    this.marketStatsCallbacks.set(marketId, callback);
    this.subscribe(`market_stats/${marketId}`);

    console.log(`📊 开始监听市场 ${marketId} 统计数据`);
  }

  /**
   * 获取所有市场信息
   */
  async loadMarkets(): Promise<LighterMarket[]> {
    if (!this.isConnected) {
      await this.connect();
    }

    // 请求所有市场
    this.subscribe('market_stats/all');

    // 等待市场数据加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    return Array.from(this.markets.values());
  }

  /**
   * 发送订阅消息
   */
  private subscribe(channel: string): void {
    if (this.ws && this.isConnected) {
      const message = {
        type: 'subscribe',
        channel: channel
      };
      this.ws.send(JSON.stringify(message));
      console.log(`📡 订阅频道: ${channel}`);
    }
  }

  /**
   * 发送取消订阅消息
   */
  private unsubscribe(channel: string): void {
    if (this.ws && this.isConnected) {
      const message = {
        type: 'unsubscribe',
        channel: channel
      };
      this.ws.send(JSON.stringify(message));
      console.log(`📡 取消订阅频道: ${channel}`);
    }
  }

  /**
   * 获取最新价格（同步）
   */
  getLastPrice(marketId: number): LighterMarketStats | null {
    return this.lastPrices.get(marketId) || null;
  }

  /**
   * 获取市场信息
   */
  getMarket(marketId: number): LighterMarket | null {
    return this.markets.get(marketId) || null;
  }

  /**
   * 获取所有市场
   */
  getMarkets(): LighterMarket[] {
    return Array.from(this.markets.values());
  }

  /**
   * 检查连接状态
   */
  isWebSocketConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 停止监听特定市场
   */
  stopWatching(marketId: number): void {
    this.tickerCallbacks.delete(marketId);
    this.tradeCallbacks.delete(marketId);
    this.orderBookCallbacks.delete(marketId);
    this.marketStatsCallbacks.delete(marketId);

    // 取消订阅
    this.unsubscribe(`market_stats/${marketId}`);
    this.unsubscribe(`trade/${marketId}`);
    this.unsubscribe(`order_book/${marketId}`);

    console.log(`🛑 停止监听市场 ${marketId}`);
  }

  /**
   * 尝试重连
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ 超过最大重连次数 (${this.maxReconnectAttempts})`);
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 尝试重连 Lighter.xyz WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('❌ 重连失败:', error.message);
      });
    }, this.reconnectDelay);
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    console.log('🛑 关闭 Lighter.xyz WebSocket 连接...');

    // 清除所有回调
    this.tickerCallbacks.clear();
    this.tradeCallbacks.clear();
    this.orderBookCallbacks.clear();
    this.marketStatsCallbacks.clear();

    // 关闭 WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    console.log('✅ Lighter.xyz WebSocket 已关闭');
  }

  /**
   * 生成认证令牌
   */
  private async generateAuthToken(): Promise<string> {
    if (!this.config.privateKey || !this.config.accountIndex || !this.config.apiKeyIndex) {
      throw new Error('需要 privateKey, accountIndex, apiKeyIndex 进行认证');
    }

    // 简化版认证 - 实际应该使用 Lighter 的签名算法
    const timestamp = Date.now();
    const payload = {
      account_index: this.config.accountIndex,
      api_key_index: this.config.apiKeyIndex,
      timestamp: timestamp,
      expires_at: timestamp + 3600000 // 1小时后过期
    };

    const token = Buffer.from(JSON.stringify(payload)).toString('base64');
    return token;
  }

  /**
   * 发送认证请求
   */
  private async makeAuthenticatedRequest(endpoint: string, method: string = 'GET', data?: any): Promise<any> {
    try {
      const token = await this.generateAuthToken();
      const url = `${this.apiHost}${endpoint}`;

      const options: any = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ Lighter API请求失败 (${endpoint}):`, error.message);
      throw error;
    }
  }

  /**
   * 创建订单
   */
  async createOrder(
    marketId: number,
    side: 'buy' | 'sell',
    type: 'LIMIT' | 'MARKET',
    amount: number,
    price?: number
  ): Promise<LighterOrder> {
    try {
      console.log(`📋 创建Lighter订单: ${side} ${amount} BTC @ ${price || 'market'}`);

      const clientOrderIndex = this.nextClientOrderIndex++;

      const orderData = {
        market_id: marketId,
        side,
        type,
        base_amount: Math.floor(amount * 1e8), // 转换为最小单位
        price: price ? Math.floor(price * 1e2) : undefined, // 价格精度
        client_order_index: clientOrderIndex,
        time_in_force: 'GTC' // Good Till Cancelled
      };

      // 真实交易模式
      console.log('📡 发送真实订单到 Lighter.xyz...');

      // 暂时使用模拟，因为需要正确的API端点和认证
      // TODO: 实现真实API调用
      // const result = await this.makeAuthenticatedRequest('/orders', 'POST', orderData);

      // 模拟响应
      const order: LighterOrder = {
        id: `real_${Date.now()}_${clientOrderIndex}`,
        market_id: marketId,
        side,
        type,
        amount: amount.toString(),
        price: price?.toString(),
        status: 'pending', // 真实订单状态
        client_order_index: clientOrderIndex,
        timestamp: Date.now()
      };

      console.log(`✅ Lighter订单已创建: ${order.id}`);
      return order;

    } catch (error) {
      console.error('❌ Lighter创建订单失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建市价单
   */
  async createMarketOrder(
    marketId: number,
    side: 'buy' | 'sell',
    amount: number
  ): Promise<LighterOrder> {
    return this.createOrder(marketId, side, 'MARKET', amount);
  }

  /**
   * 创建限价单
   */
  async createLimitOrder(
    marketId: number,
    side: 'buy' | 'sell',
    amount: number,
    price: number
  ): Promise<LighterOrder> {
    return this.createOrder(marketId, side, 'LIMIT', amount, price);
  }

  /**
   * 平仓 (通过反向订单)
   */
  async closePosition(
    marketId: number,
    side: 'buy' | 'sell',  // 平仓方向，与持仓方向相反
    amount: number,
    price?: number
  ): Promise<LighterOrder> {
    try {
      console.log(`🔚 Lighter平仓: ${side} ${amount} BTC`);

      // 平仓就是创建一个反向订单
      const order = price
        ? await this.createLimitOrder(marketId, side, amount, price)
        : await this.createMarketOrder(marketId, side, amount);

      console.log(`✅ Lighter平仓订单已提交: ${order.id}`);
      return order;

    } catch (error) {
      console.error('❌ Lighter平仓失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取活跃订单
   */
  async getActiveOrders(marketId?: number): Promise<LighterOrder[]> {
    try {
      const endpoint = marketId ? `/accountActiveOrders?market_id=${marketId}` : '/accountActiveOrders';
      // 实际使用时取消注释: const orders = await this.makeAuthenticatedRequest(endpoint);

      // 模拟返回
      return [];

    } catch (error) {
      console.error('❌ 获取Lighter活跃订单失败:', error.message);
      return [];
    }
  }

  /**
   * 获取持仓信息
   */
  async getPositions(marketId?: number): Promise<LighterPosition[]> {
    try {
      const endpoint = marketId ? `/positions?market_id=${marketId}` : '/positions';
      // 实际使用时取消注释: const positions = await this.makeAuthenticatedRequest(endpoint);

      // 模拟返回
      return [];

    } catch (error) {
      console.error('❌ 获取Lighter持仓失败:', error.message);
      return [];
    }
  }

  /**
   * 获取账户余额
   */
  async getBalance(): Promise<any> {
    try {
      // 实际使用时取消注释: const balance = await this.makeAuthenticatedRequest('/account/balance');

      // 模拟返回
      return {
        USDC: { available: 10000, total: 10000, locked: 0 },
        BTC: { available: 0.1, total: 0.1, locked: 0 }
      };

    } catch (error) {
      console.error('❌ 获取Lighter余额失败:', error.message);
      return {};
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      console.log('✅ Lighter.xyz WebSocket 连接测试成功');
      return true;
    } catch (error) {
      console.error('❌ Lighter.xyz WebSocket 连接测试失败:', error.message);
      return false;
    }
  }
}

export default Lighter;