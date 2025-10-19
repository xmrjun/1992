import ccxt from 'ccxt';

export interface ParadexConfig {
  apiKey?: string;
  secret?: string;
  privateKey?: string;
  walletAddress?: string;
  sandbox?: boolean;
}

/**
 * Paradex交易所API包装器
 * 基于CCXT Pro，支持WebSocket实时数据
 */
export class Paradex {
  private exchange: ccxt.pro.paradex;
  private priceCallbacks: Map<string, (ticker: any) => void> = new Map();
  private orderBookCallbacks: Map<string, (orderbook: any) => void> = new Map();
  private tradesCallbacks: Map<string, (trades: any[]) => void> = new Map();
  private lastPrices: Map<string, number> = new Map();

  constructor(config: ParadexConfig = {}) {
    const exchangeConfig: any = {
      sandbox: config.sandbox || false,
      enableRateLimit: true,
      options: {}
    };

    // 处理私钥格式 - 确保正确的格式
    if (config.privateKey && config.walletAddress) {
      // 移除0x前缀（如果存在）并确保正确的格式
      let formattedPrivateKey = config.privateKey;
      if (formattedPrivateKey.startsWith('0x')) {
        formattedPrivateKey = formattedPrivateKey.slice(2);
      }

      // 确保私钥是64字符的十六进制字符串
      if (formattedPrivateKey.length !== 64) {
        throw new Error(`私钥长度不正确: 期待64字符，实际${formattedPrivateKey.length}字符`);
      }

      exchangeConfig.privateKey = formattedPrivateKey;
      exchangeConfig.walletAddress = config.walletAddress;
      exchangeConfig.options.starknet = {
        privateKey: formattedPrivateKey,
        address: config.walletAddress
      };
    }

    console.log('Paradex配置:', {
      sandbox: exchangeConfig.sandbox,
      hasPrivateKey: !!config.privateKey,
      privateKeyLength: config.privateKey?.length,
      formattedPrivateKeyLength: exchangeConfig.privateKey?.length,
      hasWallet: !!config.walletAddress
    });

    this.exchange = new ccxt.pro.paradex(exchangeConfig);
  }

  /**
   * 获取市场信息
   */
  async loadMarkets(): Promise<any> {
    return await this.exchange.loadMarkets();
  }

  /**
   * 获取单个市场的Ticker信息
   */
  async fetchTicker(symbol: string = 'BTC/USD'): Promise<any> {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return {
        symbol: ticker.symbol,
        last: ticker.last,
        bid: ticker.bid,
        ask: ticker.ask,
        high: ticker.high,
        low: ticker.low,
        volume: ticker.baseVolume,
        timestamp: ticker.timestamp,
        price: ticker.last,
        lastPrice: ticker.last,
        markPrice: ticker.last
      };
    } catch (error) {
      console.error('❌ Paradex获取价格失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取订单簿
   */
  async fetchOrderBook(symbol: string = 'BTC/USD', limit: number = 100): Promise<any> {
    try {
      return await this.exchange.fetchOrderBook(symbol, limit);
    } catch (error) {
      console.error('❌ Paradex获取订单簿失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取账户余额
   */
  async fetchBalance(): Promise<any> {
    try {
      const balance = await this.exchange.fetchBalance();

      // 转换为标准格式
      const result: any = {};
      Object.keys(balance).forEach(currency => {
        if (balance[currency] && typeof balance[currency] === 'object') {
          result[currency] = {
            free: balance[currency].free || 0,
            used: balance[currency].used || 0,
            total: balance[currency].total || 0
          };
        }
      });

      return result;
    } catch (error) {
      console.error('❌ Paradex获取余额失败:', error.message);
      return {};
    }
  }

  /**
   * 获取持仓
   */
  async fetchPositions(symbols?: string[]): Promise<any[]> {
    try {
      const positions = await this.exchange.fetchPositions(symbols);

      return positions
        .filter((pos: any) => Math.abs(parseFloat(pos.contracts || 0)) > 0)
        .map((pos: any) => ({
          symbol: pos.symbol,
          side: pos.side,
          contracts: Math.abs(parseFloat(pos.contracts || 0)),
          contractSize: Math.abs(parseFloat(pos.contractSize || 0)),
          positionAmt: parseFloat(pos.contracts || 0),
          notional: Math.abs(parseFloat(pos.notional || 0)),
          entryPrice: parseFloat(pos.entryPrice || 0),
          markPrice: parseFloat(pos.markPrice || 0),
          unrealizedPnl: parseFloat(pos.unrealizedPnl || 0),
          percentage: parseFloat(pos.percentage || 0),
          leverage: parseFloat(pos.leverage || 1)
        }));
    } catch (error) {
      console.error('❌ Paradex获取持仓失败:', error.message);
      return [];
    }
  }

  /**
   * 创建订单
   */
  async createOrder(
    symbol: string,
    type: 'market' | 'limit',
    side: 'buy' | 'sell',
    amount: number,
    price?: number,
    params?: any
  ): Promise<any> {
    try {
      const order = await this.exchange.createOrder(symbol, type, side, amount, price, params);

      return {
        id: order.id,
        symbol: order.symbol,
        side: order.side?.toLowerCase(),
        amount: parseFloat(order.amount || 0),
        price: order.price ? parseFloat(order.price) : null,
        status: order.status?.toLowerCase() || 'open',
        timestamp: order.timestamp
      };
    } catch (error) {
      console.error('❌ Paradex下单失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建市价单
   */
  async createMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    price?: number,
    params?: any
  ): Promise<any> {
    return this.createOrder(symbol, 'market', side, amount, price, params);
  }

  /**
   * 获取成交记录
   */
  async fetchMyTrades(symbol: string, limit: number = 100, since?: number): Promise<any[]> {
    try {
      const trades = await this.exchange.fetchMyTrades(symbol, since, limit);

      return trades.map((trade: any) => ({
        id: trade.id,
        orderId: trade.order,
        symbol: trade.symbol,
        side: trade.side?.toLowerCase(),
        amount: parseFloat(trade.amount || 0),
        price: parseFloat(trade.price || 0),
        fee: {
          cost: parseFloat(trade.fee?.cost || 0),
          currency: trade.fee?.currency || 'USD'
        },
        timestamp: trade.timestamp,
        time: trade.timestamp
      }));
    } catch (error) {
      console.error('❌ Paradex获取成交记录失败:', error.message);
      return [];
    }
  }

  // ========== WebSocket 方法 ==========

  /**
   * 监听价格数据 (使用轮询替代WebSocket)
   */
  async watchTicker(symbol: string, callback: (ticker: any) => void): Promise<void> {
    try {
      this.priceCallbacks.set(symbol, callback);

      console.log(`🔌 开始监听Paradex ${symbol} 价格 (轮询模式)...`);

      // 使用轮询替代WebSocket
      this.startPollingTicker(symbol);

    } catch (error) {
      console.error('❌ Paradex价格监听失败:', error.message);
      throw error;
    }
  }

  /**
   * 内部方法：启动价格监听
   */
  /**
   * 使用REST API轮询价格 (替代WebSocket)
   */
  private async startPollingTicker(symbol: string): Promise<void> {
    console.log(`🔄 开始Paradex ${symbol} 轮询...`);

    const poll = async () => {
      if (!this.priceCallbacks.has(symbol)) return;

      try {
        console.log(`📡 请求Paradex ${symbol} REST API...`);
        const ticker = await this.exchange.fetchTicker(symbol);
        console.log(`📊 收到Paradex REST响应:`, {
          symbol: ticker.symbol,
          last: ticker.last,
          close: ticker.close,
          bid: ticker.bid,
          ask: ticker.ask
        });

        if (ticker && (ticker.last || ticker.close)) {
          const price = parseFloat(ticker.last || ticker.close);
          this.lastPrices.set(symbol, price);

          console.log(`📊 Paradex价格更新: ${price} USD`);

          const callback = this.priceCallbacks.get(symbol);
          if (callback) {
            callback({
              symbol: ticker.symbol,
              lastPrice: price.toString(),
              price: price.toString(),
              bid: ticker.bid,
              ask: ticker.ask,
              timestamp: ticker.timestamp
            });
          }
        } else {
          console.log(`⚠️ Paradex ticker数据为空:`, ticker);
        }

      } catch (error) {
        console.error(`❌ Paradex ${symbol} REST API错误:`, error.message);
      }

      // 每2秒轮询一次
      if (this.priceCallbacks.has(symbol)) {
        setTimeout(poll, 2000);
      }
    };

    // 开始轮询
    poll();
  }

  /**
   * 监听订单簿 (WebSocket)
   */
  async watchOrderBook(symbol: string, callback: (orderbook: any) => void): Promise<void> {
    try {
      this.orderBookCallbacks.set(symbol, callback);

      console.log(`📊 开始监听Paradex ${symbol} 订单簿...`);

      this.startOrderBookWatch(symbol);

    } catch (error) {
      console.error('❌ Paradex订单簿WebSocket连接失败:', error.message);
      throw error;
    }
  }

  /**
   * 内部方法：启动订单簿监听
   */
  private async startOrderBookWatch(symbol: string): Promise<void> {
    try {
      while (this.orderBookCallbacks.has(symbol)) {
        const orderbook = await this.exchange.watchOrderBook(symbol);

        const callback = this.orderBookCallbacks.get(symbol);
        if (callback) {
          callback(orderbook);
        }
      }
    } catch (error) {
      console.error(`❌ Paradex ${symbol} 订单簿WebSocket错误:`, error.message);

      setTimeout(() => {
        if (this.orderBookCallbacks.has(symbol)) {
          console.log(`🔄 Paradex ${symbol} 订单簿WebSocket重连中...`);
          this.startOrderBookWatch(symbol);
        }
      }, 5000);
    }
  }

  /**
   * 监听成交数据 (WebSocket)
   */
  async watchTrades(symbol: string, callback: (trades: any[]) => void): Promise<void> {
    try {
      this.tradesCallbacks.set(symbol, callback);

      console.log(`📈 开始监听Paradex ${symbol} 成交数据...`);

      this.startTradesWatch(symbol);

    } catch (error) {
      console.error('❌ Paradex成交数据WebSocket连接失败:', error.message);
      throw error;
    }
  }

  /**
   * 内部方法：启动成交数据监听
   */
  private async startTradesWatch(symbol: string): Promise<void> {
    try {
      while (this.tradesCallbacks.has(symbol)) {
        const trades = await this.exchange.watchTrades(symbol);

        const callback = this.tradesCallbacks.get(symbol);
        if (callback && trades && trades.length > 0) {
          callback(trades);
        }
      }
    } catch (error) {
      console.error(`❌ Paradex ${symbol} 成交数据WebSocket错误:`, error.message);

      setTimeout(() => {
        if (this.tradesCallbacks.has(symbol)) {
          console.log(`🔄 Paradex ${symbol} 成交数据WebSocket重连中...`);
          this.startTradesWatch(symbol);
        }
      }, 5000);
    }
  }

  /**
   * 获取最新价格（同步）
   */
  getLastPrice(symbol: string = 'BTC/USD'): number {
    return this.lastPrices.get(symbol) || 0;
  }

  /**
   * 检查WebSocket连接状态
   */
  isWebSocketConnected(): boolean {
    return this.priceCallbacks.size > 0 || this.orderBookCallbacks.size > 0 || this.tradesCallbacks.size > 0;
  }

  /**
   * 停止监听特定交易对
   */
  stopWatching(symbol: string): void {
    this.priceCallbacks.delete(symbol);
    this.orderBookCallbacks.delete(symbol);
    this.tradesCallbacks.delete(symbol);
    console.log(`🛑 停止监听Paradex ${symbol}`);
  }

  /**
   * 关闭所有WebSocket连接
   */
  async close(): Promise<void> {
    this.priceCallbacks.clear();
    this.orderBookCallbacks.clear();
    this.tradesCallbacks.clear();

    try {
      await this.exchange.close();
      console.log('🔌 Paradex WebSocket已关闭');
    } catch (error) {
      console.error('❌ 关闭Paradex WebSocket时出错:', error.message);
    }
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      // 先加载市场获取可用交易对
      const markets = await this.loadMarkets();
      const symbols = Object.keys(markets);
      const testSymbol = symbols.find(s => s.includes('BTC')) || symbols[0];

      if (testSymbol) {
        await this.fetchTicker(testSymbol);
        console.log('✅ Paradex API连接正常');
        return true;
      } else {
        console.log('❌ 未找到可用的交易对');
        return false;
      }
    } catch (error) {
      console.error('❌ Paradex API连接失败:', error.message);
      return false;
    }
  }
}

export default Paradex;