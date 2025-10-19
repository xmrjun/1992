#!/usr/bin/env node

/**
 * EdgeX-Paradex 套利机器人
 * 基于背包+AsterDEX策略，使用并发交易
 */

import ParadexWebSocketClient from './paradex-ws-client.js';
import EdgexAPI from './edgex-api.js';
import dotenv from 'dotenv';

// 加载配置
dotenv.config({ path: '/root/aster-bot/.env.edgex' });
dotenv.config({ path: '/root/aster-bot/.env.paradex' });

// 交易配置 (双向对冲套利策略)
const CONFIG = {
  // 交易对配置
  EDGEX_SYMBOL: 'BTCUSD',              // EdgeX BTC/USD
  PARADEX_SYMBOL: 'BTC-USD-PERP',      // Paradex BTC永续合约

  // 交易参数
  TRADE_AMOUNT: 0.005,                 // 每次交易 0.005 BTC
  ARB_THRESHOLD: 100,                  // 100美元价差开仓
  CLOSE_THRESHOLD: 40,                 // 40美元价差平仓
  MAX_SPREAD: 500,                     // 最大价差限制（避免异常数据）

  // 风险控制
  MAX_POSITIONS: 5,                    // 最大持仓数
  STOP_LOSS: 0.20,                     // 20%止损

  // 时间控制
  TRADE_INTERVAL: 1000,                // 1秒检查一次
  OPEN_LOCK_DURATION: 10000,           // 开仓后锁定10秒
  CLOSE_LOCK_DURATION: 30000,          // 平仓后冷却30秒
};

interface ArbitragePosition {
  id: string;
  edgexSide: 'buy' | 'sell';
  paradexSide: 'buy' | 'sell';
  amount: number;
  edgexPrice: number;
  paradexPrice: number;
  spread: number;
  openTime: number;
  status: 'open' | 'closing' | 'closed';

  // 实际成交信息
  edgexFills: TradeFill[];
  paradexFills: TradeFill[];
}

interface TradeFill {
  id: string;
  orderId: string;
  side: string;
  size: number;
  price: number;
  fee: number;
  feeToken: string;
  liquidity?: string;  // MAKER or TAKER
  timestamp: number;
}

class EdgeXParadexArbitrageBot {
  private edgexAPI: EdgexAPI;
  private paradexWS: ParadexWebSocketClient;  // 现在同时处理 WebSocket 和交易

  // 价格数据
  private edgexPrice: number = 0;
  private paradexPrice: number = 0;
  private lastPriceUpdate: number = 0;

  // 交易状态
  private positions: ArbitragePosition[] = [];
  private isTrading: boolean = false;
  private lastTradeTime: number = 0;
  private tradeLockUntil: number = 0;

  // 统计数据
  private stats = {
    totalTrades: 0,
    profitableTrades: 0,
    totalProfit: 0,
    totalFees: 0,
    bestSpread: 0,
    opportunities: 0,
    startTime: Date.now(),

    // 手续费统计
    edgexTotalFee: 0,
    paradexTotalFee: 0,
    makerCount: 0,
    takerCount: 0
  };

  constructor() {
    this.edgexAPI = new EdgexAPI({
      starkPrivateKey: process.env.EDGEX_STARK_PRIVATE_KEY!,
      accountId: process.env.EDGEX_ACCOUNT_ID
    });

    this.paradexWS = new ParadexWebSocketClient({
      l1Address: process.env.PARADEX_L1_ADDRESS!,
      l2PrivateKey: process.env.PARADEX_L2_PRIVATE_KEY!,
      market: CONFIG.PARADEX_SYMBOL,
      testnet: process.env.PARADEX_TESTNET !== 'false'
    });
    // 注意：现在 paradexWS 同时处理 WebSocket 数据流和 REST API 交易
  }

  async start(): Promise<void> {
    console.log('🚀 EdgeX ↔ Paradex 套利机器人启动');
    console.log('=====================================');
    console.log(`EdgeX: ${CONFIG.EDGEX_SYMBOL}`);
    console.log(`Paradex: ${CONFIG.PARADEX_SYMBOL}`);
    console.log(`策略: 双向对冲套利`);
    console.log(`交易量: ${CONFIG.TRADE_AMOUNT} BTC`);
    console.log(`开仓: 价差 ≥ $${CONFIG.ARB_THRESHOLD}`);
    console.log(`平仓: 价差 ≤ $${CONFIG.CLOSE_THRESHOLD}`);
    console.log(`最大持仓: ${CONFIG.MAX_POSITIONS} 个`);
    console.log(`模式: ${process.env.PARADEX_TESTNET !== 'false' ? '🧪 测试网' : '💰 主网'}`);
    console.log('');

    try {
      await this.initializeConnections();
      this.startTrading();
    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      process.exit(1);
    }
  }

  async initializeConnections(): Promise<void> {
    console.log('🔌 初始化交易所连接...\n');

    // EdgeX WebSocket
    console.log('📡 连接 EdgeX Public WebSocket...');
    await this.edgexAPI.connectWebSocket((price) => {
      this.edgexPrice = price;
      this.lastPriceUpdate = Date.now();
      this.checkArbitrageOpportunity();
    });
    console.log('✅ EdgeX Public WebSocket 已连接');

    // EdgeX Private WebSocket（监听成交记录）
    console.log('📡 连接 EdgeX Private WebSocket...');
    await this.edgexAPI.connectPrivateWebSocket({
      onTrade: (trade) => this.handleEdgexFill(trade),
      onOrder: (order) => {
        console.log(`📋 EdgeX订单: ${order.orderId} - ${order.status}`);
      },
      onPosition: (position) => {
        console.log(`📊 EdgeX持仓: ${position.contractId} - ${position.size}`);
      }
    });
    console.log('✅ EdgeX Private WebSocket 已连接');

    // Paradex WebSocket（使用官方SDK）
    console.log('📡 连接 Paradex (官方SDK WebSocket)...');

    // 监听价格更新
    this.paradexWS.on('price', (price: number) => {
      this.paradexPrice = price;
      this.lastPriceUpdate = Date.now();
      this.checkArbitrageOpportunity();
    });

    // 监听连接事件
    this.paradexWS.on('connected', (data: any) => {
      console.log('✅ Paradex WebSocket 已连接');
      console.log(`   L2地址: ${data.l2_address}`);
    });

    this.paradexWS.on('ready', () => {
      console.log('✅ Paradex WebSocket 就绪（包含交易功能）');
    });

    this.paradexWS.on('error', (error: Error) => {
      console.error('❌ Paradex WebSocket 错误:', error.message);
    });

    this.paradexWS.on('disconnected', () => {
      console.warn('⚠️ Paradex WebSocket 断开，将自动重连...');
    });

    // 监听成交记录（重要：捕获实际成交价和手续费）
    this.paradexWS.on('fill', (fill: any) => {
      this.handleParadexFill(fill);
    });

    // 连接 WebSocket（现在同时处理数据流和交易）
    await this.paradexWS.connect();

    console.log('\n🎯 所有交易所连接完成，开始监控...\n');
  }

  startTrading(): void {
    this.isTrading = true;
    console.log('🔄 开始交易监控...\n');

    // 每10分钟显示统计
    setInterval(() => {
      this.showStatistics();
    }, 10 * 60 * 1000);
  }

  checkArbitrageOpportunity(): void {
    if (!this.edgexPrice || !this.paradexPrice ||
        this.edgexPrice === 0 || this.paradexPrice === 0) return;

    if (!this.isTrading) return;

    const now = Date.now();

    // 检查交易锁定
    if (now < this.tradeLockUntil) return;

    // 计算价差
    const spread = Math.abs(this.edgexPrice - this.paradexPrice);
    const avgPrice = (this.edgexPrice + this.paradexPrice) / 2;
    const spreadPercent = (spread / avgPrice) * 100;

    // 实时显示价格 (每30秒显示一次)
    if (now - this.lastPriceUpdate > 30000) {
      const now_str = new Date().toLocaleTimeString();
      console.log(`[${now_str}] EdgeX: $${this.edgexPrice.toFixed(2)} | Paradex: $${this.paradexPrice.toFixed(2)} | 价差: $${spread.toFixed(2)}`);
    }

    // 记录最佳价差
    if (spread > this.stats.bestSpread) {
      this.stats.bestSpread = spread;
    }

    // 检查平仓机会
    this.checkCloseOpportunity();

    // 检查开仓机会
    if (this.positions.length < CONFIG.MAX_POSITIONS && spread >= CONFIG.ARB_THRESHOLD) {
      this.stats.opportunities++;

      console.log(`\n🚨 套利机会! 价差: $${spread.toFixed(2)} (${spreadPercent.toFixed(3)}%)`);
      console.log(`   EdgeX: $${this.edgexPrice.toFixed(2)} | Paradex: $${this.paradexPrice.toFixed(2)}`);

      this.openArbitragePosition(spread);
    }
  }

  async openArbitragePosition(spread: number): Promise<void> {
    if (this.positions.length >= CONFIG.MAX_POSITIONS) return;

    const now = Date.now();
    const positionId = `arb_${now}`;

    try {
      // 确定交易方向
      const edgexLower = this.edgexPrice < this.paradexPrice;
      const edgexSide: 'buy' | 'sell' = edgexLower ? 'buy' : 'sell';
      const paradexSide: 'buy' | 'sell' = edgexLower ? 'sell' : 'buy';

      console.log(`⚡ 执行套利交易: ${edgexSide} EdgeX @ $${this.edgexPrice.toFixed(2)}, ${paradexSide} Paradex @ $${this.paradexPrice.toFixed(2)}`);

      // 并发下单
      const [edgexResult, paradexResult] = await Promise.all([
        this.placeEdgexOrder(edgexSide, CONFIG.TRADE_AMOUNT),
        this.placeParadexOrder(paradexSide, CONFIG.TRADE_AMOUNT)
      ]);

      if (edgexResult.success && paradexResult.success) {
        // 创建仓位记录
        const position: ArbitragePosition = {
          id: positionId,
          edgexSide,
          paradexSide,
          amount: CONFIG.TRADE_AMOUNT,
          edgexPrice: this.edgexPrice,
          paradexPrice: this.paradexPrice,
          spread: spread,
          openTime: now,
          status: 'open',
          edgexFills: [],
          paradexFills: []
        };

        this.positions.push(position);
        this.stats.totalTrades++;
        this.lastTradeTime = now;
        this.tradeLockUntil = now + CONFIG.OPEN_LOCK_DURATION;

        console.log(`✅ 套利仓位开启成功!`);
        console.log(`   EdgeX 订单: ${edgexResult.orderId}`);
        console.log(`   Paradex 订单: ${paradexResult.orderId}`);
        console.log(`   仓位 ID: ${positionId}`);
        console.log(`   预期利润: $${(spread * CONFIG.TRADE_AMOUNT).toFixed(2)}`);

      } else {
        console.log(`❌ 套利交易失败:`);
        if (!edgexResult.success) console.log(`   EdgeX: ${edgexResult.error}`);
        if (!paradexResult.success) console.log(`   Paradex: ${paradexResult.error}`);
      }

    } catch (error) {
      console.error(`❌ 套利执行错误:`, error.message);
    }

    console.log(`   ${'-'.repeat(50)}\n`);
  }

  checkCloseOpportunity(): void {
    this.positions.forEach(async (position) => {
      if (position.status !== 'open') return;

      const now = Date.now();
      const elapsed = now - position.openTime;

      // 计算当前价差
      const currentSpread = Math.abs(this.edgexPrice - this.paradexPrice);

      // 检查平仓条件
      const shouldClose =
        currentSpread <= CONFIG.CLOSE_THRESHOLD ||      // 价差收缩到40美元以下
        this.checkStopLoss(position);                   // 止损

      if (shouldClose) {
        await this.closeArbitragePosition(position);
      }
    });
  }

  checkStopLoss(position: ArbitragePosition): boolean {
    // 计算当前损益
    const pnl = this.calculatePositionPnL(position);
    const maxLoss = position.amount * position.edgexPrice * CONFIG.STOP_LOSS;

    return pnl < -maxLoss;
  }

  calculatePositionPnL(position: ArbitragePosition): number {
    // 简化的PnL计算
    const edgexPnL = position.edgexSide === 'buy' ?
      (this.edgexPrice - position.edgexPrice) * position.amount :
      (position.edgexPrice - this.edgexPrice) * position.amount;

    const paradexPnL = position.paradexSide === 'buy' ?
      (this.paradexPrice - position.paradexPrice) * position.amount :
      (position.paradexPrice - this.paradexPrice) * position.amount;

    return edgexPnL + paradexPnL;
  }

  async closeArbitragePosition(position: ArbitragePosition): Promise<void> {
    if (position.status !== 'open') return;

    position.status = 'closing';
    console.log(`\n🔄 平仓套利仓位: ${position.id}`);

    try {
      // 并发平仓 (反向操作)
      const [edgexResult, paradexResult] = await Promise.all([
        this.placeEdgexOrder(position.edgexSide === 'buy' ? 'sell' : 'buy', position.amount, true), // reduceOnly=true
        this.placeParadexOrder(position.paradexSide === 'buy' ? 'sell' : 'buy', position.amount)
      ]);

      if (edgexResult.success && paradexResult.success) {
        position.status = 'closed';

        // 使用实际成交数据计算PnL
        const { pnl, totalFee, netPnl } = this.calculateActualPnL(position);
        this.stats.totalProfit += pnl;

        if (pnl > 0) {
          this.stats.profitableTrades++;
        }

        this.tradeLockUntil = Date.now() + CONFIG.CLOSE_LOCK_DURATION;

        console.log(`✅ 仓位平仓成功!`);
        console.log(`   毛利润: $${pnl.toFixed(4)}`);
        console.log(`   手续费: $${totalFee.toFixed(4)}`);
        console.log(`   净利润: $${netPnl.toFixed(4)}`);
        console.log(`   累计毛利润: $${this.stats.totalProfit.toFixed(4)}`);
        console.log(`   累计净利润: $${(this.stats.totalProfit - this.stats.totalFees).toFixed(4)}`);

        // 从活跃仓位中移除
        this.positions = this.positions.filter(p => p.id !== position.id);

      } else {
        console.log(`❌ 平仓失败:`);
        if (!edgexResult.success) console.log(`   EdgeX: ${edgexResult.error}`);
        if (!paradexResult.success) console.log(`   Paradex: ${paradexResult.error}`);
        position.status = 'open'; // 恢复状态
      }

    } catch (error) {
      console.error(`❌ 平仓错误:`, error.message);
      position.status = 'open'; // 恢复状态
    }
  }

  checkAndCloseExpiredPositions(): void {
    // 对冲套利策略：不设置强制平仓时间
    // 只在价差收敛或止损时平仓
  }

  async placeEdgexOrder(side: 'buy' | 'sell', amount: number, reduceOnly: boolean = false): Promise<{success: boolean, orderId?: string, error?: string}> {
    try {
      const result = await this.edgexAPI.createOrder(CONFIG.EDGEX_SYMBOL, 'market', side, amount, undefined, { reduceOnly });
      return { success: true, orderId: result.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async placeParadexOrder(side: 'buy' | 'sell', amount: number): Promise<{success: boolean, orderId?: string, error?: string}> {
    try {
      // 使用 Python 服务下单
      const result = await this.paradexWS.createMarketOrder(CONFIG.PARADEX_SYMBOL, side, amount);
      return { success: true, orderId: result.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  handleEdgexFill(trade: any): void {
    try {
      const fill: TradeFill = {
        id: trade.tradeId || trade.id,
        orderId: trade.orderId,
        side: trade.side,
        size: parseFloat(trade.quantity || trade.size || 0),
        price: parseFloat(trade.price || 0),
        fee: parseFloat(trade.fee || trade.commission || 0),
        feeToken: trade.feeToken || trade.commissionAsset || 'USD',
        liquidity: trade.liquidity,
        timestamp: Date.now()
      };

      // 记录手续费统计
      this.stats.edgexTotalFee += fill.fee;
      this.stats.totalFees += fill.fee;
      if (fill.liquidity === 'MAKER') this.stats.makerCount++;
      else this.stats.takerCount++;

      // 找到对应的仓位并记录
      const position = this.positions.find(p => p.status === 'open');
      if (position) {
        position.edgexFills.push(fill);
        console.log(`💰 EdgeX成交: ${fill.side} ${fill.size} @ $${fill.price.toFixed(2)} | 手续费: $${fill.fee.toFixed(4)} (${fill.liquidity || 'N/A'})`);
      }
    } catch (error: any) {
      console.error('❌ EdgeX成交记录处理失败:', error.message);
    }
  }

  handleParadexFill(fill: any): void {
    try {
      const tradeFill: TradeFill = {
        id: fill.id,
        orderId: fill.order_id,
        side: fill.side,
        size: fill.size,
        price: fill.price,
        fee: fill.fee,
        feeToken: fill.fee_token,
        liquidity: fill.liquidity,
        timestamp: Date.now()
      };

      // 记录手续费统计
      this.stats.paradexTotalFee += tradeFill.fee;
      this.stats.totalFees += tradeFill.fee;
      if (tradeFill.liquidity === 'MAKER') this.stats.makerCount++;
      else this.stats.takerCount++;

      // 找到对应的仓位并记录
      const position = this.positions.find(p => p.status === 'open');
      if (position) {
        position.paradexFills.push(tradeFill);
        console.log(`💰 Paradex成交: ${tradeFill.side} ${tradeFill.size} @ $${tradeFill.price.toFixed(2)} | 手续费: $${tradeFill.fee.toFixed(4)} (${tradeFill.liquidity || 'N/A'})`);
      }
    } catch (error: any) {
      console.error('❌ Paradex成交记录处理失败:', error.message);
    }
  }

  calculateActualPnL(position: ArbitragePosition): { pnl: number; totalFee: number; netPnl: number } {
    // 计算EdgeX实际PnL
    let edgexPnl = 0;
    let edgexFee = 0;
    position.edgexFills.forEach(fill => {
      if (fill.side === 'buy') {
        edgexPnl -= fill.price * fill.size;
      } else {
        edgexPnl += fill.price * fill.size;
      }
      edgexFee += fill.fee;
    });

    // 计算Paradex实际PnL
    let paradexPnl = 0;
    let paradexFee = 0;
    position.paradexFills.forEach(fill => {
      if (fill.side === 'buy') {
        paradexPnl -= fill.price * fill.size;
      } else {
        paradexPnl += fill.price * fill.size;
      }
      paradexFee += fill.fee;
    });

    const totalPnl = edgexPnl + paradexPnl;
    const totalFee = edgexFee + paradexFee;
    const netPnl = totalPnl - totalFee;

    return { pnl: totalPnl, totalFee, netPnl };
  }

  showStatistics(): void {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 60000);
    const winRate = this.stats.totalTrades > 0 ? (this.stats.profitableTrades / this.stats.totalTrades * 100) : 0;
    const avgProfit = this.stats.totalTrades > 0 ? (this.stats.totalProfit / this.stats.totalTrades) : 0;
    const avgFee = this.stats.totalTrades > 0 ? (this.stats.totalFees / this.stats.totalTrades) : 0;
    const netProfit = this.stats.totalProfit - this.stats.totalFees;

    console.log('\n📊 套利统计报告');
    console.log('=====================================');
    console.log(`⏱️  运行时间: ${uptime} 分钟`);
    console.log(`📈 总交易次数: ${this.stats.totalTrades}`);
    console.log(`💰 毛利润: $${this.stats.totalProfit.toFixed(4)}`);
    console.log(`💸 总手续费: $${this.stats.totalFees.toFixed(4)}`);
    console.log(`   EdgeX: $${this.stats.edgexTotalFee.toFixed(4)}`);
    console.log(`   Paradex: $${this.stats.paradexTotalFee.toFixed(4)}`);
    console.log(`💵 净利润: $${netProfit.toFixed(4)}`);
    console.log(`🎯 盈利交易: ${this.stats.profitableTrades}/${this.stats.totalTrades} (${winRate.toFixed(1)}%)`);
    console.log(`📊 平均利润: $${avgProfit.toFixed(4)} (净: $${(avgProfit - avgFee).toFixed(4)})`);
    console.log(`📉 平均手续费: $${avgFee.toFixed(4)}`);
    console.log(`🏷️  手续费类型: Maker ${this.stats.makerCount} | Taker ${this.stats.takerCount}`);
    console.log(`🔥 最佳价差: $${this.stats.bestSpread.toFixed(2)}`);
    console.log(`🚨 套利机会: ${this.stats.opportunities} 次`);
    console.log(`📋 活跃仓位: ${this.positions.length}/${CONFIG.MAX_POSITIONS}`);
    console.log(`💹 当前价差: $${Math.abs(this.edgexPrice - this.paradexPrice).toFixed(2)}`);
    console.log('=====================================\n');
  }

  async stop(): Promise<void> {
    console.log('\n🛑 正在停止套利机器人...');
    this.isTrading = false;

    // 平仓所有活跃仓位
    for (const position of this.positions) {
      if (position.status === 'open') {
        await this.closeArbitragePosition(position);
      }
    }

    this.showStatistics();
    await this.paradexWS.close();
    console.log('✅ 套利机器人已停止');
  }
}

// 运行套利机器人
const bot = new EdgeXParadexArbitrageBot();

process.on('SIGINT', async () => {
  console.log('\n🛑 用户中断，正在安全退出...');
  await bot.stop();
  process.exit(0);
});

bot.start().catch(error => {
  console.error('❌ 套利机器人失败:', error);
  process.exit(1);
});