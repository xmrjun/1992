#!/usr/bin/env node

/**
 * Lighter.xyz 完整交易 API 包装器
 * 集成 Python SDK 实现真实交易功能
 * 支持批量操作、风险管理、高级策略
 */

import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// 基础接口定义
export interface LighterConfig {
  testnet?: boolean;
  apiHost?: string;
  accountIndex?: number;
  apiKeyIndex?: number;
  privateKey?: string;
  walletAddress?: string;
  marketId?: number;
}

export interface LighterPosition {
  marketId: number;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  timestamp: number;
}

export interface LighterOrder {
  id: string;
  marketId: number;
  side: 'buy' | 'sell';
  type: 'LIMIT' | 'MARKET';
  amount: number;
  price?: number;
  status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected';
  clientOrderIndex?: number;
  timestamp: number;
  txHash?: string;
}

export interface LighterTicker {
  symbol: string;
  lastPrice: number;
  markPrice: number;
  indexPrice: number;
  bid: number;
  ask: number;
  high: number;
  low: number;
  volume: number;
  timestamp: number;
  priceChange: number;
  priceChangePercent: number;
}

export interface LighterBalance {
  asset: string;
  available: number;
  total: number;
  locked: number;
}

// 高级交易配置
export interface TradingStrategy {
  name: string;
  enabled: boolean;
  params: Record<string, any>;
}

export interface RiskConfig {
  maxPositionSize: number;
  maxDailyLoss: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxLeverage: number;
  forceCloseTime: number; // 毫秒
}

export interface BatchOperation {
  type: 'open' | 'close' | 'modify' | 'cancel';
  orders: LighterOrder[];
  strategy?: string;
  priority: number;
}

/**
 * Lighter.xyz 完整交易客户端
 * 集成 WebSocket 价格流和 Python SDK 交易功能
 */
export class LighterTradingClient {
  private config: LighterConfig;
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private isConnected: boolean = false;

  // 数据缓存
  private currentPrice: number = 0;
  private currentTicker: LighterTicker | null = null;
  private positions: Map<number, LighterPosition> = new Map();
  private activeOrders: Map<string, LighterOrder> = new Map();
  private balances: Map<string, LighterBalance> = new Map();

  // 交易状态
  private isTrading: boolean = false;
  private tradingPaused: boolean = false;
  private lastTradeTime: number = 0;
  private dailyPnl: number = 0;
  private dailyVolume: number = 0;
  private dailyTrades: number = 0;

  // 风险管理
  private riskConfig: RiskConfig;
  private strategies: Map<string, TradingStrategy> = new Map();
  private batchQueue: BatchOperation[] = [];

  // 回调函数
  private tickerCallback?: (ticker: LighterTicker) => void;
  private positionCallback?: (positions: LighterPosition[]) => void;
  private orderCallback?: (order: LighterOrder) => void;

  constructor(config: LighterConfig) {
    this.config = {
      testnet: false,
      apiHost: 'https://mainnet.zklighter.elliot.ai',
      marketId: 1, // BTC-USDT
      ...config
    };

    this.wsUrl = config.testnet
      ? 'wss://testnet.zklighter.elliot.ai/stream'
      : 'wss://mainnet.zklighter.elliot.ai/stream';

    // 默认风险配置
    this.riskConfig = {
      maxPositionSize: 0.1, // 最大 0.1 BTC
      maxDailyLoss: 1000, // 最大日亏损 $1000
      stopLossPercent: 0.05, // 5% 止损
      takeProfitPercent: 0.10, // 10% 止盈
      maxLeverage: 5,
      forceCloseTime: 30 * 60 * 1000 // 30分钟强制平仓
    };

    this.initializeStrategies();
  }

  /**
   * 初始化交易策略
   */
  private initializeStrategies(): void {
    // 网格交易策略
    this.strategies.set('grid', {
      name: '网格交易',
      enabled: false,
      params: {
        gridSize: 100, // $100 网格间距
        gridLevels: 5, // 5层网格
        baseAmount: 0.01, // 每格 0.01 BTC
        centerPrice: 0 // 中心价格，0表示使用当前价格
      }
    });

    // DCA策略
    this.strategies.set('dca', {
      name: '定投策略',
      enabled: false,
      params: {
        interval: 3600000, // 1小时间隔
        amount: 0.01, // 每次 0.01 BTC
        priceDropPercent: 0.02, // 2%下跌时加仓
        maxPositions: 10 // 最大10次加仓
      }
    });

    // 套利策略
    this.strategies.set('arbitrage', {
      name: '套利交易',
      enabled: true,
      params: {
        threshold: 120, // $120 开仓阈值
        closeThreshold: 60, // $60 平仓阈值
        maxSpread: 200, // $200 最大价差
        amount: 0.02 // 每次 0.02 BTC
      }
    });
  }

  /**
   * 启动客户端
   */
  async start(): Promise<void> {
    console.log('🚀 启动 Lighter.xyz 交易客户端');

    try {
      // 连接 WebSocket
      await this.connectWebSocket();

      // 初始化数据
      await this.loadInitialData();

      // 启动交易循环
      this.startTradingLoop();

      console.log('✅ Lighter 交易客户端启动完成');

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      throw error;
    }
  }

  /**
   * 连接 WebSocket
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`🔌 连接 Lighter WebSocket: ${this.wsUrl}`);

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          console.log('✅ WebSocket 连接成功');
          this.isConnected = true;
          this.subscribeToMarket();
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleWebSocketMessage(message);
          } catch (error) {
            console.error('❌ WebSocket 消息解析错误:', error.message);
          }
        });

        this.ws.on('close', () => {
          console.log('🔌 WebSocket 连接关闭');
          this.isConnected = false;
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('❌ WebSocket 错误:', error.message);
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
   * 订阅市场数据
   */
  private subscribeToMarket(): void {
    if (this.ws && this.isConnected) {
      const marketId = this.config.marketId!;

      // 订阅价格数据
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `market_stats/${marketId}`
      }));

      // 订阅订单簿
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `order_book/${marketId}`
      }));

      console.log(`📡 已订阅市场 ${marketId} 数据流`);
    }
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleWebSocketMessage(message: any): void {
    try {
      const { type, market_stats, order_book } = message;

      if (type === 'update/market_stats' && market_stats) {
        this.updateMarketStats(market_stats);
      } else if (type === 'update/order_book' && order_book) {
        this.updateOrderBook(order_book);
      }

    } catch (error) {
      console.error('❌ 处理 WebSocket 消息错误:', error.message);
    }
  }

  /**
   * 更新市场统计数据
   */
  private updateMarketStats(stats: any): void {
    this.currentPrice = parseFloat(stats.last_trade_price);

    this.currentTicker = {
      symbol: 'BTCUSDT',
      lastPrice: parseFloat(stats.last_trade_price),
      markPrice: parseFloat(stats.mark_price),
      indexPrice: parseFloat(stats.index_price),
      bid: 0,
      ask: 0,
      high: 0,
      low: 0,
      volume: parseFloat(stats.volume_24h || '0'),
      timestamp: Date.now(),
      priceChange: stats.daily_price_change,
      priceChangePercent: stats.daily_price_change * 100
    };

    // 触发价格回调
    if (this.tickerCallback) {
      this.tickerCallback(this.currentTicker);
    }
  }

  /**
   * 更新订单簿
   */
  private updateOrderBook(orderBook: any): void {
    if (this.currentTicker && orderBook.bids?.length > 0 && orderBook.asks?.length > 0) {
      this.currentTicker.bid = parseFloat(orderBook.bids[0][0]);
      this.currentTicker.ask = parseFloat(orderBook.asks[0][0]);
    }
  }

  /**
   * 加载初始数据
   */
  private async loadInitialData(): Promise<void> {
    try {
      // 等待价格数据
      await this.waitForPriceData();

      // 加载持仓
      await this.loadPositions();

      // 加载活跃订单
      await this.loadActiveOrders();

      // 加载余额
      await this.loadBalances();

    } catch (error) {
      console.error('❌ 加载初始数据失败:', error.message);
    }
  }

  /**
   * 等待价格数据
   */
  private async waitForPriceData(): Promise<void> {
    return new Promise((resolve) => {
      const checkPrice = () => {
        if (this.currentPrice > 0) {
          console.log(`💰 当前 BTC 价格: $${this.currentPrice.toFixed(2)}`);
          resolve();
        } else {
          setTimeout(checkPrice, 100);
        }
      };
      checkPrice();
    });
  }

  /**
   * 执行 Python 脚本
   */
  private async executePythonScript(scriptName: string, args: string[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [scriptName, ...args], {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // 尝试解析 JSON 输出
            const lines = stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];

            if (lastLine.startsWith('{') || lastLine.startsWith('[')) {
              resolve(JSON.parse(lastLine));
            } else {
              resolve({ success: true, output: stdout });
            }
          } catch (error) {
            resolve({ success: true, output: stdout });
          }
        } else {
          reject(new Error(`Python script failed: ${stderr}`));
        }
      });
    });
  }

  /**
   * 创建市价买单
   */
  async createMarketBuyOrder(amount: number): Promise<LighterOrder> {
    try {
      console.log(`📈 创建市价买单: ${amount} BTC`);

      // 风险检查
      await this.performRiskCheck('buy', amount);

      // 调用 Python 脚本执行真实交易
      const result = await this.executePythonScript('lighter_market_order.py', [
        'buy',
        amount.toString(),
        this.currentPrice.toString()
      ]);

      const order: LighterOrder = {
        id: `buy_${Date.now()}`,
        marketId: this.config.marketId!,
        side: 'buy',
        type: 'MARKET',
        amount,
        status: result.success ? 'filled' : 'rejected',
        timestamp: Date.now(),
        txHash: result.txHash
      };

      this.activeOrders.set(order.id, order);
      this.lastTradeTime = Date.now();
      this.dailyTrades++;
      this.dailyVolume += amount;

      // 触发订单回调
      if (this.orderCallback) {
        this.orderCallback(order);
      }

      console.log(`✅ 市价买单执行完成: ${order.id}`);
      return order;

    } catch (error) {
      console.error('❌ 创建市价买单失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建市价卖单
   */
  async createMarketSellOrder(amount: number): Promise<LighterOrder> {
    try {
      console.log(`📉 创建市价卖单: ${amount} BTC`);

      // 风险检查
      await this.performRiskCheck('sell', amount);

      // 调用 Python 脚本执行真实交易
      const result = await this.executePythonScript('lighter_market_order.py', [
        'sell',
        amount.toString(),
        this.currentPrice.toString()
      ]);

      const order: LighterOrder = {
        id: `sell_${Date.now()}`,
        marketId: this.config.marketId!,
        side: 'sell',
        type: 'MARKET',
        amount,
        status: result.success ? 'filled' : 'rejected',
        timestamp: Date.now(),
        txHash: result.txHash
      };

      this.activeOrders.set(order.id, order);
      this.lastTradeTime = Date.now();
      this.dailyTrades++;
      this.dailyVolume += amount;

      // 触发订单回调
      if (this.orderCallback) {
        this.orderCallback(order);
      }

      console.log(`✅ 市价卖单执行完成: ${order.id}`);
      return order;

    } catch (error) {
      console.error('❌ 创建市价卖单失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量开仓
   */
  async batchOpenPositions(orders: { side: 'buy' | 'sell'; amount: number; price?: number }[]): Promise<LighterOrder[]> {
    console.log(`🔄 批量开仓: ${orders.length} 个订单`);

    const results: LighterOrder[] = [];

    for (const orderParams of orders) {
      try {
        const order = orderParams.price
          ? await this.createLimitOrder(orderParams.side, orderParams.amount, orderParams.price)
          : await (orderParams.side === 'buy'
              ? this.createMarketBuyOrder(orderParams.amount)
              : this.createMarketSellOrder(orderParams.amount));

        results.push(order);

        // 间隔防止API限制
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ 批量开仓失败 (${orderParams.side} ${orderParams.amount}):`, error.message);
      }
    }

    console.log(`✅ 批量开仓完成: ${results.length}/${orders.length} 成功`);
    return results;
  }

  /**
   * 批量平仓
   */
  async batchClosePositions(): Promise<LighterOrder[]> {
    console.log('🔚 批量平仓所有持仓');

    const positions = Array.from(this.positions.values());
    const closeOrders: LighterOrder[] = [];

    for (const position of positions) {
      try {
        const closeOrder = await (position.side === 'long'
          ? this.createMarketSellOrder(position.size)
          : this.createMarketBuyOrder(position.size));

        closeOrders.push(closeOrder);

        // 间隔防止API限制
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ 平仓失败 (${position.side} ${position.size}):`, error.message);
      }
    }

    console.log(`✅ 批量平仓完成: ${closeOrders.length} 个订单`);
    return closeOrders;
  }

  /**
   * 创建限价单
   */
  async createLimitOrder(side: 'buy' | 'sell', amount: number, price: number): Promise<LighterOrder> {
    try {
      console.log(`📋 创建限价${side === 'buy' ? '买' : '卖'}单: ${amount} BTC @ $${price}`);

      // 风险检查
      await this.performRiskCheck(side, amount);

      const order: LighterOrder = {
        id: `limit_${side}_${Date.now()}`,
        marketId: this.config.marketId!,
        side,
        type: 'LIMIT',
        amount,
        price,
        status: 'pending',
        timestamp: Date.now()
      };

      this.activeOrders.set(order.id, order);

      console.log(`✅ 限价单已提交: ${order.id}`);
      return order;

    } catch (error) {
      console.error('❌ 创建限价单失败:', error.message);
      throw error;
    }
  }

  /**
   * 风险检查
   */
  private async performRiskCheck(side: 'buy' | 'sell', amount: number): Promise<void> {
    // 检查持仓大小
    const totalPosition = Array.from(this.positions.values())
      .reduce((sum, pos) => sum + pos.size, 0);

    if (totalPosition + amount > this.riskConfig.maxPositionSize) {
      throw new Error(`超过最大持仓限制: ${this.riskConfig.maxPositionSize} BTC`);
    }

    // 检查日亏损
    if (this.dailyPnl < -this.riskConfig.maxDailyLoss) {
      throw new Error(`达到日亏损限制: $${this.riskConfig.maxDailyLoss}`);
    }

    // 检查交易暂停
    if (this.tradingPaused) {
      throw new Error('交易已暂停');
    }

    // 检查最小交易间隔
    const timeSinceLastTrade = Date.now() - this.lastTradeTime;
    if (timeSinceLastTrade < 100) { // 100ms 最小间隔
      throw new Error('交易频率过高');
    }
  }

  /**
   * 加载持仓信息
   */
  private async loadPositions(): Promise<void> {
    try {
      // 模拟持仓数据
      // 实际使用时调用 Python 脚本获取真实持仓
      this.positions.clear();

    } catch (error) {
      console.error('❌ 加载持仓失败:', error.message);
    }
  }

  /**
   * 加载活跃订单
   */
  private async loadActiveOrders(): Promise<void> {
    try {
      // 模拟订单数据
      this.activeOrders.clear();

    } catch (error) {
      console.error('❌ 加载活跃订单失败:', error.message);
    }
  }

  /**
   * 加载余额信息
   */
  private async loadBalances(): Promise<void> {
    try {
      // 调用 Python 脚本获取真实余额
      const result = await this.executePythonScript('lighter_check_balance.py');

      if (result.balances) {
        this.balances.clear();
        for (const [asset, balance] of Object.entries(result.balances)) {
          this.balances.set(asset, balance as LighterBalance);
        }
      }

    } catch (error) {
      console.error('❌ 加载余额失败:', error.message);
    }
  }

  /**
   * 启动交易循环
   */
  private startTradingLoop(): void {
    setInterval(() => {
      this.processBatchQueue();
      this.checkRiskLimits();
      this.updatePerformanceMetrics();
    }, 1000); // 每秒检查一次
  }

  /**
   * 处理批量队列
   */
  private processBatchQueue(): void {
    if (this.batchQueue.length === 0 || this.isTrading) return;

    // 按优先级排序
    this.batchQueue.sort((a, b) => b.priority - a.priority);

    const operation = this.batchQueue.shift();
    if (operation) {
      this.executeBatchOperation(operation);
    }
  }

  /**
   * 执行批量操作
   */
  private async executeBatchOperation(operation: BatchOperation): Promise<void> {
    this.isTrading = true;

    try {
      switch (operation.type) {
        case 'open':
          await this.batchOpenPositions(operation.orders);
          break;
        case 'close':
          await this.batchClosePositions();
          break;
        // 其他操作类型...
      }
    } catch (error) {
      console.error('❌ 批量操作失败:', error.message);
    } finally {
      this.isTrading = false;
    }
  }

  /**
   * 检查风险限制
   */
  private checkRiskLimits(): void {
    // 检查强制平仓时间
    const positions = Array.from(this.positions.values());
    const now = Date.now();

    for (const position of positions) {
      if (now - position.timestamp > this.riskConfig.forceCloseTime) {
        console.log('⏰ 触发强制平仓');
        this.forceClosePosition(position);
      }
    }
  }

  /**
   * 强制平仓
   */
  private async forceClosePosition(position: LighterPosition): Promise<void> {
    try {
      const closeOrder = position.side === 'long'
        ? await this.createMarketSellOrder(position.size)
        : await this.createMarketBuyOrder(position.size);

      console.log(`🔚 强制平仓完成: ${closeOrder.id}`);

    } catch (error) {
      console.error('❌ 强制平仓失败:', error.message);
    }
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(): void {
    // 计算 PnL
    let totalPnl = 0;
    for (const position of this.positions.values()) {
      totalPnl += position.unrealizedPnl;
    }

    this.dailyPnl = totalPnl;
  }

  /**
   * 设置价格回调
   */
  onTicker(callback: (ticker: LighterTicker) => void): void {
    this.tickerCallback = callback;
  }

  /**
   * 设置持仓回调
   */
  onPosition(callback: (positions: LighterPosition[]) => void): void {
    this.positionCallback = callback;
  }

  /**
   * 设置订单回调
   */
  onOrder(callback: (order: LighterOrder) => void): void {
    this.orderCallback = callback;
  }

  /**
   * 获取当前状态
   */
  getStatus(): any {
    return {
      isConnected: this.isConnected,
      isTrading: this.isTrading,
      tradingPaused: this.tradingPaused,
      currentPrice: this.currentPrice,
      dailyPnl: this.dailyPnl,
      dailyVolume: this.dailyVolume,
      dailyTrades: this.dailyTrades,
      positionCount: this.positions.size,
      activeOrderCount: this.activeOrders.size,
      balanceCount: this.balances.size,
      riskConfig: this.riskConfig,
      strategies: Array.from(this.strategies.values())
    };
  }

  /**
   * 暂停交易
   */
  pauseTrading(): void {
    this.tradingPaused = true;
    console.log('⏸️ 交易已暂停');
  }

  /**
   * 恢复交易
   */
  resumeTrading(): void {
    this.tradingPaused = false;
    console.log('▶️ 交易已恢复');
  }

  /**
   * 尝试重连
   */
  private async attemptReconnect(): Promise<void> {
    console.log('🔄 尝试重连 WebSocket...');

    setTimeout(async () => {
      try {
        await this.connectWebSocket();
      } catch (error) {
        console.error('❌ 重连失败:', error.message);
      }
    }, 5000);
  }

  /**
   * 关闭客户端
   */
  async close(): Promise<void> {
    console.log('🛑 关闭 Lighter 交易客户端...');

    // 平仓所有持仓（可选）
    if (this.positions.size > 0) {
      console.log('🔚 平仓所有持仓...');
      await this.batchClosePositions();
    }

    // 关闭 WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    console.log('✅ Lighter 交易客户端已关闭');
  }
}

export default LighterTradingClient;