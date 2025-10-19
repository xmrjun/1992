#!/usr/bin/env node

/**
 * EdgeX-Paradex 套利机器人
 * 使用多层次加权价差计算算法
 */

import { SimpleTraderEdgexParadex } from './utils/simple-trader-edgex-paradex.js';
import { tradeHistoryEdgexParadex } from './utils/trade-history-edgex-paradex.js';
import { type OrderBook } from './utils/advanced-spread.js';
import * as config from './edgex-paradex-config.js';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '/root/aster-bot/.env.edgex' });
dotenv.config({ path: '/root/aster-bot/.env.paradex' });

// ==================== 类型定义 ====================

interface PriceData {
  edgex: {
    bid: number;
    ask: number;
    orderbook: OrderBook;
    timestamp: number;
  } | null;
  paradex: {
    bid: number;
    ask: number;
    orderbook: OrderBook;
    timestamp: number;
  } | null;
}

// ==================== 主程序 ====================

class EdgeXParadexArbBot {
  private trader: SimpleTraderEdgexParadex;
  private priceData: PriceData = { edgex: null, paradex: null };
  private lastTradeTime: number = 0;
  private lastFailureTime: number = 0;  // 上次开仓失败时间

  private isRunning = false;
  private isProcessing = false;  // 防止并发执行（开仓或平仓）
  private isTrading = false;     // 正在执行交易（更严格的锁）
  private stats = {
    startTime: Date.now(),
    opportunities: 0,
    lastCheckTime: 0,
    lastLogTime: 0,
    rejections: 0
  };

  constructor() {
    this.trader = new SimpleTraderEdgexParadex();
  }

  /**
   * 启动机器人
   */
  async start(): Promise<void> {
    console.log('🚀 EdgeX ↔ Paradex 套利机器人启动');
    console.log('=====================================');
    console.log(`EdgeX: ${config.EDGEX_SYMBOL}`);
    console.log(`Paradex: ${config.PARADEX_SYMBOL}`);
    console.log(`交易量: ${config.TRADE_AMOUNT} BTC`);
    console.log(`开仓价差: ${config.MIN_OPEN_SPREAD} - ${config.MAX_OPEN_SPREAD} USD`);
    console.log(`平仓价差: ${config.CLOSE_SPREAD_THRESHOLD} USD`);
    console.log(`EMA平滑: alpha=${config.EMA_ALPHA}`);
    console.log('');

    try {
      console.log('🔌 初始化交易执行器...');
      await this.trader.initialize();
      console.log('✅ 交易执行器初始化完成\n');

      // 订阅价格更新
      this.subscribeToPrice();

      // 启动交易循环
      this.isRunning = true;
      this.startTradingLoop();

      // 定时显示统计
      setInterval(() => {
        this.showStatistics();
      }, 10 * 60 * 1000); // 每10分钟

    } catch (error: any) {
      console.error('❌ 启动失败:', error.message);
      process.exit(1);
    }
  }

  /**
   * 验证订单簿数据完整性
   */
  private validateOrderBook(book: any): book is OrderBook {
    if (!book || typeof book !== 'object') return false;
    if (!Array.isArray(book.bids) || !Array.isArray(book.asks)) return false;
    if (book.bids.length < 3 || book.asks.length < 3) return false;  // 至少3档深度（适配5档配置）

    // 验证第一档结构
    const firstBid = book.bids[0];
    const firstAsk = book.asks[0];
    if (!Array.isArray(firstBid) || firstBid.length < 2) return false;
    if (!Array.isArray(firstAsk) || firstAsk.length < 2) return false;

    // 验证类型
    if (typeof firstBid[0] !== 'number' || typeof firstBid[1] !== 'number') return false;
    if (typeof firstAsk[0] !== 'number' || typeof firstAsk[1] !== 'number') return false;

    return true;
  }

  /**
   * 订阅价格更新事件
   */
  private subscribeToPrice(): void {
    this.trader.on('edgex_price', (data: any) => {
      // ✅ STRICT VALIDATION: 拒绝无效数据
      if (!this.validateOrderBook(data.orderbook)) {
        console.error('❌ EdgeX 订单簿数据无效或深度不足 - 拒绝更新');
        return;  // 不存储无效数据
      }

      // ✅ 只存储有效数据
      this.priceData.edgex = {
        bid: data.bid,
        ask: data.ask,
        orderbook: data.orderbook,  // ✅ 已验证有效
        timestamp: Date.now()
      };
    });

    this.trader.on('paradex_price', (data: any) => {
      // ✅ STRICT VALIDATION: 拒绝无效数据
      if (!this.validateOrderBook(data.orderbook)) {
        console.error('❌ Paradex 订单簿数据无效或深度不足 - 拒绝更新');
        return;  // 不存储无效数据
      }

      // ✅ 只存储有效数据
      this.priceData.paradex = {
        bid: data.bid,
        ask: data.ask,
        orderbook: data.orderbook,  // ✅ 已验证有效
        timestamp: Date.now()
      };
    });

    console.log('📡 已订阅价格更新事件\n');
  }

  /**
   * 主交易循环
   */
  private async startTradingLoop(): Promise<void> {
    console.log('🔄 开始交易循环...\n');

    // 定期输出状态汇总（每30秒）
    setInterval(() => {
      this.showStatusSummary();
    }, 30 * 1000);

    setInterval(async () => {
      if (!this.isRunning) return;

      // ✅ 防止循环重叠执行：如果上一次还在执行，跳过本次
      if (this.isTrading) {
        return;
      }

      this.isTrading = true;

      try {
        // 检查平仓机会
        await this.checkCloseOpportunity();

        // 检查开仓机会
        await this.checkOpenOpportunity();

      } catch (error: any) {
        console.error('❌ 交易循环错误:', error.message);
      } finally {
        this.isTrading = false;
      }
    }, config.TRADE_INTERVAL);
  }

  /**
   * 检查开仓机会
   */
  private async checkOpenOpportunity(): Promise<void> {
    // ✅ 修复：在函数入口就设置标志，防止 TOCTOU 竞态条件
    // 如果上一次还在处理，直接跳过
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      // ✅ 失败冷却期检查 - 避免疯狂重试
      const now = Date.now();
      const timeSinceFailure = now - this.lastFailureTime;
      if (this.lastFailureTime > 0 && timeSinceFailure < config.FAILURE_COOLDOWN) {
        return; // 静默跳过，避免刷屏
      }

      // 如果已有持仓，跳过
      if (await this.trader.hasOpenPositions()) {
        return;
      }

      // ✅ 检查价格数据是否有效
      if (!this.priceData.edgex || !this.priceData.paradex) {
        return;
      }

      // ✅ 检查数据新鲜度（5秒阈值）
      const edgexAge = now - this.priceData.edgex.timestamp;
      const paradexAge = now - this.priceData.paradex.timestamp;
      const MAX_STALE_TIME = 5000;  // 5秒

      if (edgexAge > MAX_STALE_TIME || paradexAge > MAX_STALE_TIME) {
        console.warn(`⚠️  数据过时: EdgeX ${edgexAge}ms, Paradex ${paradexAge}ms`);
        return;
      }

      // ✅ 使用简单 BBO 价差（不用多档加权）
      const edgexBid = this.priceData.edgex.bid;
      const edgexAsk = this.priceData.edgex.ask;
      const paradexBid = this.priceData.paradex.bid;
      const paradexAsk = this.priceData.paradex.ask;

      // 计算简单价差
      // 买EdgeX卖Paradex: paradex可以卖的价格 - edgex需要买的价格
      const spreadA = paradexBid - edgexAsk;

      // 卖EdgeX买Paradex: edgex可以卖的价格 - paradex需要买的价格
      const spreadB = edgexBid - paradexAsk;

      // 判断是否开仓（简单阈值判断）
      let direction: 'buy_edgex_sell_paradex' | 'sell_edgex_buy_paradex' | null = null;
      let triggerSpread = 0;

      if (spreadA >= config.MIN_OPEN_SPREAD) {
        direction = 'buy_edgex_sell_paradex';
        triggerSpread = spreadA;
      } else if (spreadB >= config.MIN_OPEN_SPREAD) {
        direction = 'sell_edgex_buy_paradex';
        triggerSpread = spreadB;
      }

      // 如果没有套利机会，退出
      if (!direction) {
        return;
      }

      // 检查冷却期
      const timeSinceLastTrade = now - this.lastTradeTime;
      if (timeSinceLastTrade < config.MIN_COOLDOWN) {
        return;
      }

      // 打印套利机会
      this.stats.opportunities++;
      console.log(`\n🚨 套利机会!`);
      console.log(`   方向: ${direction}`);
      console.log(`   价差: $${triggerSpread.toFixed(2)}`);
      console.log(`   EdgeX: ${edgexBid.toFixed(1)}/${edgexAsk.toFixed(1)}`);
      console.log(`   Paradex: ${paradexBid.toFixed(1)}/${paradexAsk.toFixed(1)}`);

      // 执行开仓
      const result = await this.trader.openPosition(direction, config.TRADE_AMOUNT, triggerSpread);

      if (result.success) {
        this.lastTradeTime = Date.now();
        console.log(`✅ 开仓成功! Trade ID: ${result.id}\n`);
      } else {
        this.lastFailureTime = Date.now();
        console.error(`❌ 开仓失败: ${result.error}\n`);
      }
    } finally {
      // ✅ 无论成功失败，都要重置标志
      this.isProcessing = false;
    }
  }

  /**
   * 检查平仓机会
   */
  private async checkCloseOpportunity(): Promise<void> {
    // 如果没有持仓，跳过
    if (!(await this.trader.hasOpenPositions())) {
      return;
    }

    const position = this.trader.getCurrentPosition();
    if (!position) return;

    const now = Date.now();

    // ✅ 检查价格数据是否有效
    if (!this.priceData.edgex || !this.priceData.paradex) {
      return;
    }

    // ✅ 检查数据新鲜度（5秒阈值）
    const edgexAge = now - this.priceData.edgex.timestamp;
    const paradexAge = now - this.priceData.paradex.timestamp;
    const MAX_STALE_TIME = 5000;  // 5秒

    if (edgexAge > MAX_STALE_TIME || paradexAge > MAX_STALE_TIME) {
      console.warn(`⚠️  平仓检查: 数据过时 - EdgeX ${edgexAge}ms, Paradex ${paradexAge}ms`);
      return;
    }

    // 用和开仓一样的方式计算当前价差
    const edgexBid = this.priceData.edgex.bid;
    const edgexAsk = this.priceData.edgex.ask;
    const paradexBid = this.priceData.paradex.bid;
    const paradexAsk = this.priceData.paradex.ask;

    const currentOpenSpread = position.direction === 'buy_edgex_sell_paradex'
      ? paradexBid - edgexAsk
      : edgexBid - paradexAsk;

    // 计算价差改善程度
    const spreadImprovement = position.openSpread - currentOpenSpread;

    // 平仓条件：价差收窄到阈值以下
    const shouldClose = currentOpenSpread <= config.CLOSE_SPREAD_THRESHOLD;

    // 强制平仓检查
    const holdTime = Date.now() - position.openTime;
    const forceClose = holdTime > config.FORCE_CLOSE_TIME;

    if (shouldClose || forceClose) {
      console.log(`\n🔄 触发平仓条件:`);
      console.log(`   开仓价差: $${position.openSpread.toFixed(2)}`);
      console.log(`   当前价差: $${currentOpenSpread.toFixed(2)}`);
      console.log(`   价差改善: $${spreadImprovement.toFixed(2)} ${spreadImprovement > 0 ? '✅收窄' : '❌扩大'}`);
      console.log(`   持仓时长: ${Math.floor(holdTime / 1000)}秒`);
      console.log(`   原因: ${forceClose ? '强制平仓' : '价差收敛'}`);

      const success = await this.trader.closeAllPositions();

      if (success) {
        console.log('');
      }
    }
  }

  /**
   * 显示状态汇总（简洁版，每30秒）
   */
  private showStatusSummary(): void {
    const now = Date.now();
    if (!this.priceData.edgex || !this.priceData.paradex) {
      console.log(`[${new Date().toLocaleTimeString()}] ⏳ 等待价格数据...`);
      return;
    }

    // 计算简单 BBO 价差
    const edgexBid = this.priceData.edgex.bid;
    const edgexAsk = this.priceData.edgex.ask;
    const paradexBid = this.priceData.paradex.bid;
    const paradexAsk = this.priceData.paradex.ask;

    const spreadA = paradexBid - edgexAsk;  // 买EdgeX卖Paradex
    const spreadB = edgexBid - paradexAsk;   // 卖EdgeX买Paradex

    const maxSpread = Math.max(spreadA, spreadB);

    console.log(
      `[${new Date().toLocaleTimeString()}] ` +
      `EdgeX: $${edgexBid.toFixed(1)}/${edgexAsk.toFixed(1)} | ` +
      `Paradex: $${paradexBid.toFixed(1)}/${paradexAsk.toFixed(1)} | ` +
      `价差: A=${spreadA.toFixed(1)} B=${spreadB.toFixed(1)} | ` +
      `最大: ${maxSpread.toFixed(0)} (阈值: ${config.MIN_OPEN_SPREAD})`
    );
  }

  /**
   * 显示统计信息
   */
  private showStatistics(): void {
    const stats = tradeHistoryEdgexParadex.getTodayStats();
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 60000);

    console.log('\n📊 套利统计报告');
    console.log('=====================================');
    console.log(`⏱️  运行时间: ${uptime} 分钟`);
    console.log(`📈 今日交易: ${stats.totalTrades} 笔`);
    console.log(`📋 当前持仓: ${stats.openTrades} 个`);
    console.log(`💰 今日盈亏: $${stats.totalPnL.toFixed(4)}`);
    console.log(`💸 今日手续费: $${stats.totalFees.toFixed(4)}`);
    console.log(`💵 净利润: $${(stats.totalPnL - stats.totalFees).toFixed(4)}`);
    console.log(`🎯 胜率: ${stats.winRate.toFixed(1)}%`);
    console.log(`📊 平均盈亏: $${stats.avgPnL.toFixed(4)}`);
    console.log(`📈 最大盈利: $${stats.maxProfit.toFixed(4)}`);
    console.log(`📉 最大亏损: $${stats.maxLoss.toFixed(4)}`);
    console.log(`🚨 套利机会: ${this.stats.opportunities} 次`);
    console.log('=====================================\n');
  }

  /**
   * 停止机器人
   */
  async stop(): Promise<void> {
    console.log('\n🛑 正在停止套利机器人...');
    this.isRunning = false;

    // 平仓所有持仓
    if (await this.trader.hasOpenPositions()) {
      console.log('📋 平仓所有持仓...');
      await this.trader.closeAllPositions();
    }

    // 显示最终统计
    this.showStatistics();

    // 关闭连接
    await this.trader.close();
    console.log('✅ 套利机器人已停止');
  }
}

// ==================== 启动机器人 ====================

const bot = new EdgeXParadexArbBot();

process.on('SIGINT', async () => {
  console.log('\n🛑 用户中断，正在安全退出...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 收到终止信号，正在安全退出...');
  await bot.stop();
  process.exit(0);
});

bot.start().catch(error => {
  console.error('❌ 套利机器人失败:', error);
  process.exit(1);
});
