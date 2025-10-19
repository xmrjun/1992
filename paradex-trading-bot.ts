#!/usr/bin/env node

/**
 * Paradex 交易机器人
 * 基于WebSocket实时价格监控和自动交易
 */

import dotenv from 'dotenv';
import { Paradex } from './exchanges/paradex.js';

// 加载环境变量
dotenv.config({ path: '.env.paradex' });

// 交易配置
const TRADING_CONFIG = {
  symbol: 'BTC/USD:USDC',        // BTC永续合约
  tradeAmount: 0.01,             // 每次交易量: 0.01 BTC
  priceThreshold: 50,            // 价格变动阈值: $50
  spreadThreshold: 0.1,          // 买卖价差阈值: 0.1%
  maxPositions: 3,               // 最大持仓数
  stopLoss: 0.02,                // 止损: 2%
  takeProfit: 0.05,              // 止盈: 5%
  maxDailyTrades: 20,            // 日最大交易次数
  tradingHours: {
    start: 9,                    // 交易开始时间 (UTC)
    end: 17                      // 交易结束时间 (UTC)
  }
};

interface Position {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  timestamp: number;
}

class ParadexTradingBot {
  private paradexAPI: Paradex;
  private currentPrice: number = 0;
  private lastTradeTime: number = 0;
  private dailyTrades: number = 0;
  private positions: Position[] = [];
  private isTrading: boolean = false;
  private startTime: number = Date.now();

  // 统计数据
  private stats = {
    totalTrades: 0,
    winTrades: 0,
    lossTrades: 0,
    totalPnl: 0,
    maxDrawdown: 0,
    bestTrade: 0,
    worstTrade: 0
  };

  constructor() {
    this.paradexAPI = new Paradex({
      apiKey: process.env.PARADEX_API_KEY,
      secret: process.env.PARADEX_SECRET,
      privateKey: process.env.PARADEX_PRIVATE_KEY,
      walletAddress: process.env.PARADEX_WALLET_ADDRESS,
      sandbox: process.env.PARADEX_SANDBOX === 'true'
    });
  }

  async start(): Promise<void> {
    console.log('🚀 Paradex 交易机器人启动');
    console.log('==========================');
    console.log(`交易对: ${TRADING_CONFIG.symbol}`);
    console.log(`交易量: ${TRADING_CONFIG.tradeAmount} BTC`);
    console.log(`价格阈值: $${TRADING_CONFIG.priceThreshold}`);
    console.log(`最大持仓: ${TRADING_CONFIG.maxPositions}`);
    console.log(`模式: ${process.env.PARADEX_SANDBOX === 'true' ? '🧪 沙箱' : '💰 实盘'}`);
    console.log('');

    try {
      // 测试连接
      console.log('🔍 测试 API 连接...');
      const connected = await this.paradexAPI.testConnection();
      if (!connected) {
        throw new Error('API连接失败');
      }

      // 加载市场
      await this.paradexAPI.loadMarkets();

      // 获取账户信息
      await this.loadAccountInfo();

      // 启动价格监控
      await this.startPriceMonitoring();

      // 启动交易逻辑
      this.startTradingLogic();

      console.log('✅ 交易机器人运行中...\n');

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      throw error;
    }
  }

  private async loadAccountInfo(): Promise<void> {
    try {
      console.log('📊 加载账户信息...');

      // 获取余额
      const balance = await this.paradexAPI.fetchBalance();
      const usdcBalance = balance.USDC || { free: 0, used: 0, total: 0 };

      console.log(`💰 USDC余额: ${usdcBalance.free.toFixed(2)} (可用) / ${usdcBalance.total.toFixed(2)} (总计)`);

      // 获取现有持仓
      const positions = await this.paradexAPI.fetchPositions();
      this.positions = positions.map(pos => ({
        id: pos.symbol + '_' + Date.now(),
        symbol: pos.symbol,
        side: pos.side,
        amount: Math.abs(pos.positionAmt),
        entryPrice: pos.entryPrice,
        currentPrice: pos.markPrice,
        unrealizedPnl: pos.unrealizedPnl,
        timestamp: Date.now()
      }));

      console.log(`📈 当前持仓: ${this.positions.length}个`);
      this.positions.forEach(pos => {
        console.log(`   ${pos.symbol} ${pos.side.toUpperCase()} ${pos.amount} @ $${pos.entryPrice} (PnL: $${pos.unrealizedPnl.toFixed(2)})`);
      });

    } catch (error) {
      console.error('❌ 获取账户信息失败:', error.message);
    }
  }

  private async startPriceMonitoring(): Promise<void> {
    console.log('🔌 启动价格监控...');

    await this.paradexAPI.watchTicker(TRADING_CONFIG.symbol, (ticker) => {
      this.currentPrice = parseFloat(ticker.lastPrice);
      this.updatePositions();

      // 显示价格更新
      const time = new Date().toLocaleTimeString();
      process.stdout.write(`\r📊 [${time}] ${ticker.symbol}: $${this.currentPrice.toFixed(2)} | 持仓: ${this.positions.length} | 今日交易: ${this.dailyTrades}`);
    });
  }

  private startTradingLogic(): void {
    // 每5秒检查一次交易机会
    setInterval(() => {
      this.checkTradingOpportunities();
    }, 5000);

    // 每分钟更新统计
    setInterval(() => {
      this.updateStats();
    }, 60000);

    // 每日重置交易计数
    setInterval(() => {
      this.dailyTrades = 0;
      console.log('\n🔄 每日交易计数重置');
    }, 24 * 60 * 60 * 1000);
  }

  private checkTradingOpportunities(): void {
    if (!this.isTrading && this.currentPrice > 0) {
      // 检查交易时间
      const hour = new Date().getUTCHours();
      if (hour < TRADING_CONFIG.tradingHours.start || hour > TRADING_CONFIG.tradingHours.end) {
        return;
      }

      // 检查日交易限制
      if (this.dailyTrades >= TRADING_CONFIG.maxDailyTrades) {
        return;
      }

      // 检查持仓限制
      if (this.positions.length >= TRADING_CONFIG.maxPositions) {
        return;
      }

      // 简单的价格趋势策略示例
      this.executeTrendStrategy();
    }
  }

  private async executeTrendStrategy(): Promise<void> {
    try {
      // 这是一个示例策略，实际应用中需要更复杂的分析
      const priceChange = Math.random() * 200 - 100; // 模拟价格变化分析

      if (Math.abs(priceChange) > TRADING_CONFIG.priceThreshold) {
        this.isTrading = true;

        const side = priceChange > 0 ? 'buy' : 'sell';
        const signal = priceChange > 0 ? '🟢 看涨' : '🔴 看跌';

        console.log(`\n🎯 交易信号: ${signal}`);
        console.log(`   价格: $${this.currentPrice.toFixed(2)}`);
        console.log(`   信号强度: ${Math.abs(priceChange).toFixed(2)}`);

        // 执行交易 (这里是示例，实际需要根据策略调整)
        // await this.executeOrder(side, TRADING_CONFIG.tradeAmount);

        console.log(`   ⚠️  模拟模式: 不执行实际交易`);

        this.lastTradeTime = Date.now();
        this.dailyTrades++;

        setTimeout(() => {
          this.isTrading = false;
        }, 30000); // 30秒冷却时间
      }

    } catch (error) {
      console.error('❌ 交易执行失败:', error.message);
      this.isTrading = false;
    }
  }

  private async executeOrder(side: 'buy' | 'sell', amount: number): Promise<void> {
    try {
      console.log(`📋 执行${side === 'buy' ? '买入' : '卖出'}订单...`);

      const order = await this.paradexAPI.createMarketOrder(
        TRADING_CONFIG.symbol,
        side,
        amount,
        this.currentPrice
      );

      console.log(`✅ 订单已提交: ${order.id}`);
      console.log(`   类型: ${side === 'buy' ? '买入' : '卖出'}`);
      console.log(`   数量: ${amount} BTC`);
      console.log(`   价格: $${this.currentPrice.toFixed(2)}`);

      // 更新持仓
      this.positions.push({
        id: order.id,
        symbol: TRADING_CONFIG.symbol,
        side,
        amount,
        entryPrice: this.currentPrice,
        currentPrice: this.currentPrice,
        unrealizedPnl: 0,
        timestamp: Date.now()
      });

      this.stats.totalTrades++;

    } catch (error) {
      console.error('❌ 下单失败:', error.message);
      throw error;
    }
  }

  private updatePositions(): void {
    this.positions.forEach(position => {
      position.currentPrice = this.currentPrice;

      // 计算未实现盈亏
      const priceDiff = position.side === 'buy'
        ? this.currentPrice - position.entryPrice
        : position.entryPrice - this.currentPrice;

      position.unrealizedPnl = priceDiff * position.amount;

      // 检查止损止盈
      this.checkStopLoss(position);
      this.checkTakeProfit(position);
    });
  }

  private checkStopLoss(position: Position): void {
    const lossPercent = Math.abs(position.unrealizedPnl) / (position.entryPrice * position.amount);

    if (lossPercent > TRADING_CONFIG.stopLoss) {
      console.log(`\n🛑 触发止损: ${position.symbol}`);
      console.log(`   损失: $${position.unrealizedPnl.toFixed(2)} (${(lossPercent * 100).toFixed(2)}%)`);
      // 这里应该执行平仓操作
      // await this.closePosition(position);
    }
  }

  private checkTakeProfit(position: Position): void {
    if (position.unrealizedPnl > 0) {
      const profitPercent = position.unrealizedPnl / (position.entryPrice * position.amount);

      if (profitPercent > TRADING_CONFIG.takeProfit) {
        console.log(`\n🎯 触发止盈: ${position.symbol}`);
        console.log(`   利润: $${position.unrealizedPnl.toFixed(2)} (${(profitPercent * 100).toFixed(2)}%)`);
        // 这里应该执行平仓操作
        // await this.closePosition(position);
      }
    }
  }

  private updateStats(): void {
    const runtime = ((Date.now() - this.startTime) / 3600000).toFixed(1); // 运行时间(小时)
    const totalPnl = this.positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);

    console.log(`\n📊 运行状态 (${runtime}小时):`);
    console.log(`   当前价格: $${this.currentPrice.toFixed(2)}`);
    console.log(`   持仓数量: ${this.positions.length}`);
    console.log(`   未实现盈亏: $${totalPnl.toFixed(2)}`);
    console.log(`   今日交易: ${this.dailyTrades}/${TRADING_CONFIG.maxDailyTrades}`);
    console.log(`   总交易次数: ${this.stats.totalTrades}`);
  }

  async stop(): Promise<void> {
    console.log('\n🛑 停止交易机器人...');

    try {
      // 关闭WebSocket连接
      await this.paradexAPI.close();

      // 显示最终统计
      this.showFinalStats();

      console.log('✅ 交易机器人已停止');

    } catch (error) {
      console.error('❌ 停止时出错:', error.message);
    }
  }

  private showFinalStats(): void {
    const runtime = ((Date.now() - this.startTime) / 3600000).toFixed(1);
    const totalPnl = this.positions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0);

    console.log('\n📈 最终统计:');
    console.log(`⏱️  运行时间: ${runtime} 小时`);
    console.log(`📊 总交易次数: ${this.stats.totalTrades}`);
    console.log(`💰 未实现盈亏: $${totalPnl.toFixed(2)}`);
    console.log(`📈 持仓数量: ${this.positions.length}`);
    console.log(`🎯 今日交易: ${this.dailyTrades}`);
  }
}

// 运行机器人
async function main() {
  const bot = new ParadexTradingBot();

  try {
    await bot.start();

    // 优雅关闭处理
    process.on('SIGINT', async () => {
      console.log('\n🛑 收到停止信号...');
      await bot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 收到终止信号...');
      await bot.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ 机器人运行失败:', error.message);
    process.exit(1);
  }
}

// 启动
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 程序启动失败:', error.message);
    process.exit(1);
  });
}

export default ParadexTradingBot;