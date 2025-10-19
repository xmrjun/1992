#!/usr/bin/env node

/**
 * Paradex ↔ AsterDEX 套利交易机器人
 * 监控两个交易所之间的价格差异，执行套利交易
 */

import dotenv from 'dotenv';
import { Paradex } from './exchanges/paradex.js';
import { Aster } from './exchanges/aster.js';

// 加载环境变量
dotenv.config({ path: '.env.paradex' });

// 交易配置
const CONFIG = {
  // 交易对配置
  PARADEX_SYMBOL: 'BTC/USD:USDC',  // Paradex BTC永续合约
  ASTER_SYMBOL: 'BTCUSDT',         // AsterDEX BTC/USDT

  // 交易参数
  TRADE_AMOUNT: 0.02,              // 每次交易 0.02 BTC
  ARB_THRESHOLD: 80,               // 80美元价差开仓
  CLOSE_DIFF: 20,                  // 20美元价差平仓
  MAX_SPREAD: 150,                 // 最大价差限制

  // 风险控制
  MAX_POSITIONS: 1,                // 最大持仓数
  STOP_LOSS: 0.15,                 // 15%止损
  FORCE_CLOSE_TIME: 30 * 60 * 1000, // 30分钟强制平仓

  // 时间控制
  TRADE_INTERVAL: 1000,            // 1秒检查一次
  OPEN_LOCK_DURATION: 10000,       // 开仓后锁定10秒
  CLOSE_LOCK_DURATION: 30000,      // 平仓后冷却30秒
};

interface ArbitragePosition {
  id: string;
  paradexSide: 'buy' | 'sell';
  asterSide: 'buy' | 'sell';
  amount: number;
  paradexPrice: number;
  asterPrice: number;
  spread: number;
  openTime: number;
  status: 'open' | 'closing' | 'closed';
}

class ParadexAsterBot {
  private paradexAPI: Paradex;
  private asterAPI: Aster;

  // 价格数据
  private paradexPrice: number = 0;
  private asterPrice: number = 0;
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
    bestSpread: 0,
    opportunities: 0,
    startTime: Date.now()
  };

  constructor() {
    this.paradexAPI = new Paradex({
      apiKey: process.env.PARADEX_API_KEY,
      secret: process.env.PARADEX_SECRET,
      privateKey: process.env.PARADEX_PRIVATE_KEY,
      walletAddress: process.env.PARADEX_WALLET_ADDRESS,
      sandbox: process.env.PARADEX_SANDBOX === 'true'
    });

    this.asterAPI = new Aster(
      process.env.PARADEX_ASTER_API_KEY || '',
      process.env.PARADEX_ASTER_API_SECRET || '',
      CONFIG.ASTER_SYMBOL
    );
  }

  async start(): Promise<void> {
    console.log('🚀 Paradex ↔ AsterDEX 套利机器人启动');
    console.log('=====================================');
    console.log(`Paradex: ${CONFIG.PARADEX_SYMBOL}`);
    console.log(`AsterDEX: ${CONFIG.ASTER_SYMBOL}`);
    console.log(`交易量: ${CONFIG.TRADE_AMOUNT} BTC`);
    console.log(`开仓阈值: $${CONFIG.ARB_THRESHOLD}`);
    console.log(`平仓阈值: $${CONFIG.CLOSE_DIFF}`);
    console.log(`模式: ${process.env.PARADEX_SANDBOX === 'true' ? '🧪 沙箱' : '💰 实盘'}`);
    console.log('');

    try {
      // 测试连接
      await this.testConnections();

      // 加载账户信息
      await this.loadAccountInfo();

      // 启动价格监控
      await this.startPriceMonitoring();

      // 启动交易逻辑
      this.startTradingLogic();

      console.log('✅ 套利机器人运行中...\n');

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      throw error;
    }
  }

  private async testConnections(): Promise<void> {
    console.log('🔍 测试交易所连接...');

    // 测试 Paradex
    const paradexOk = await this.paradexAPI.testConnection();
    if (!paradexOk) {
      console.log('⚠️  Paradex 连接失败，继续运行...');
    }

    // 测试 AsterDEX
    try {
      await this.asterAPI.fetchTicker();
      console.log('✅ AsterDEX 连接正常');
    } catch (error) {
      console.log('❌ AsterDEX 连接失败:', error.message);
      throw error;
    }
  }

  private async loadAccountInfo(): Promise<void> {
    console.log('📊 加载账户信息...');

    try {
      // Paradex 账户信息
      const paradexBalance = await this.paradexAPI.fetchBalance();
      const paradexPositions = await this.paradexAPI.fetchPositions();

      console.log(`💰 Paradex USDC: ${(paradexBalance.USDC?.free || 0).toFixed(2)}`);
      console.log(`📈 Paradex 持仓: ${paradexPositions.length}个`);

      // AsterDEX 账户信息
      const asterBalance = await this.asterAPI.getBalance();
      const asterPositions = await this.asterAPI.getPositions();

      console.log(`💰 AsterDEX USDT: ${(asterBalance.USDT?.available || 0).toFixed(2)}`);
      console.log(`📈 AsterDEX 持仓: ${asterPositions.length}个`);

    } catch (error) {
      console.error('❌ 获取账户信息失败:', error.message);
    }
  }

  private async startPriceMonitoring(): Promise<void> {
    console.log('🔌 启动价格监控...');

    // 监控 Paradex 价格
    await this.paradexAPI.watchTicker(CONFIG.PARADEX_SYMBOL, (ticker) => {
      this.paradexPrice = parseFloat(ticker.lastPrice);
      this.lastPriceUpdate = Date.now();
      this.checkArbitrageOpportunity();
    });

    // 监控 AsterDEX 价格
    await this.asterAPI.watchTicker(CONFIG.ASTER_SYMBOL, (ticker) => {
      if (ticker && ticker.lastPrice) {
        this.asterPrice = parseFloat(ticker.lastPrice);
        this.lastPriceUpdate = Date.now();
        this.checkArbitrageOpportunity();
      }
    });

    console.log('✅ 价格监控已启动');
  }

  private startTradingLogic(): void {
    // 定期检查持仓
    setInterval(() => {
      this.updatePositions();
      this.checkForceClose();
    }, CONFIG.TRADE_INTERVAL);

    // 定期显示统计
    setInterval(() => {
      this.showStats();
    }, 30000);
  }

  private checkArbitrageOpportunity(): void {
    if (this.paradexPrice <= 0 || this.asterPrice <= 0) return;
    if (Date.now() < this.tradeLockUntil) return;
    if (this.positions.length >= CONFIG.MAX_POSITIONS) return;

    const spread = Math.abs(this.paradexPrice - this.asterPrice);
    const spreadPercent = (spread / this.paradexPrice) * 100;

    // 更新最佳价差
    if (spread > this.stats.bestSpread) {
      this.stats.bestSpread = spread;
    }

    const time = new Date().toLocaleTimeString();
    const higher = this.paradexPrice > this.asterPrice ? 'Paradex' : 'AsterDEX';
    const lower = this.paradexPrice > this.asterPrice ? 'AsterDEX' : 'Paradex';

    // 检查是否达到开仓阈值
    if (spread >= CONFIG.ARB_THRESHOLD && spread <= CONFIG.MAX_SPREAD) {
      this.stats.opportunities++;

      console.log(`\n🎯 [${time}] 套利机会 #${this.stats.opportunities}:`);
      console.log(`   Paradex: $${this.paradexPrice.toFixed(2)}`);
      console.log(`   AsterDEX: $${this.asterPrice.toFixed(2)}`);
      console.log(`   价差: $${spread.toFixed(2)} (${spreadPercent.toFixed(3)}%)`);
      console.log(`   策略: ${higher}开空 + ${lower}开多`);

      this.executeArbitrage(spread);

    } else {
      // 显示当前状态
      process.stdout.write(`\r📊 [${time}] Paradex:$${this.paradexPrice.toFixed(2)} AsterDEX:$${this.asterPrice.toFixed(2)} 价差:$${spread.toFixed(2)} 机会:${this.stats.opportunities}`);
    }
  }

  private async executeArbitrage(spread: number): Promise<void> {
    if (this.isTrading) return;

    this.isTrading = true;

    try {
      const higherExchange = this.paradexPrice > this.asterPrice ? 'paradex' : 'aster';
      const lowerExchange = this.paradexPrice > this.asterPrice ? 'aster' : 'paradex';

      console.log(`\n🔄 执行套利交易...`);
      console.log(`   ${higherExchange === 'paradex' ? 'Paradex' : 'AsterDEX'} 开空 ${CONFIG.TRADE_AMOUNT} BTC`);
      console.log(`   ${lowerExchange === 'paradex' ? 'Paradex' : 'AsterDEX'} 开多 ${CONFIG.TRADE_AMOUNT} BTC`);

      // 模拟模式 - 不执行实际交易
      console.log(`   ⚠️  模拟模式: 记录套利机会，不执行实际交易`);

      // 创建虚拟持仓记录
      const position: ArbitragePosition = {
        id: Date.now().toString(),
        paradexSide: higherExchange === 'paradex' ? 'sell' : 'buy',
        asterSide: lowerExchange === 'aster' ? 'buy' : 'sell',
        amount: CONFIG.TRADE_AMOUNT,
        paradexPrice: this.paradexPrice,
        asterPrice: this.asterPrice,
        spread: spread,
        openTime: Date.now(),
        status: 'open'
      };

      this.positions.push(position);
      this.stats.totalTrades++;
      this.lastTradeTime = Date.now();
      this.tradeLockUntil = Date.now() + CONFIG.OPEN_LOCK_DURATION;

      console.log(`✅ 套利位置已开启: ${position.id}`);
      console.log(`   预期收益: $${(spread * CONFIG.TRADE_AMOUNT).toFixed(2)}`);

    } catch (error) {
      console.error('❌ 套利执行失败:', error.message);
    } finally {
      this.isTrading = false;
    }
  }

  private updatePositions(): void {
    this.positions.forEach(position => {
      if (position.status !== 'open') return;

      const currentSpread = Math.abs(this.paradexPrice - this.asterPrice);

      // 检查平仓条件
      if (currentSpread <= CONFIG.CLOSE_DIFF) {
        this.closePosition(position);
      }
    });
  }

  private async closePosition(position: ArbitragePosition): Promise<void> {
    if (position.status !== 'open') return;

    position.status = 'closing';

    const currentSpread = Math.abs(this.paradexPrice - this.asterPrice);
    const profit = (position.spread - currentSpread) * position.amount;

    console.log(`\n📋 平仓套利位置: ${position.id}`);
    console.log(`   开仓价差: $${position.spread.toFixed(2)}`);
    console.log(`   平仓价差: $${currentSpread.toFixed(2)}`);
    console.log(`   利润: $${profit.toFixed(2)}`);

    // 模拟平仓
    console.log(`   ⚠️  模拟模式: 记录平仓，不执行实际交易`);

    position.status = 'closed';
    this.stats.totalProfit += profit;

    if (profit > 0) {
      this.stats.profitableTrades++;
    }

    // 设置平仓后冷却时间
    this.tradeLockUntil = Date.now() + CONFIG.CLOSE_LOCK_DURATION;

    console.log(`✅ 套利位置已平仓`);
  }

  private checkForceClose(): void {
    const now = Date.now();

    this.positions.forEach(position => {
      if (position.status === 'open' &&
          (now - position.openTime) > CONFIG.FORCE_CLOSE_TIME) {

        console.log(`\n⏰ 强制平仓: ${position.id} (超时)`);
        this.closePosition(position);
      }
    });
  }

  private showStats(): void {
    const runtime = ((Date.now() - this.stats.startTime) / 3600000).toFixed(1);
    const openPositions = this.positions.filter(p => p.status === 'open').length;
    const winRate = this.stats.totalTrades > 0 ?
      ((this.stats.profitableTrades / this.stats.totalTrades) * 100).toFixed(1) : '0';

    console.log(`\n📊 运行统计 (${runtime}小时):`);
    console.log(`   当前价差: $${Math.abs(this.paradexPrice - this.asterPrice).toFixed(2)}`);
    console.log(`   开放持仓: ${openPositions}`);
    console.log(`   套利机会: ${this.stats.opportunities}`);
    console.log(`   完成交易: ${this.stats.totalTrades}`);
    console.log(`   盈利交易: ${this.stats.profitableTrades}/${this.stats.totalTrades} (${winRate}%)`);
    console.log(`   总利润: $${this.stats.totalProfit.toFixed(2)}`);
    console.log(`   最佳价差: $${this.stats.bestSpread.toFixed(2)}`);
  }

  async stop(): Promise<void> {
    console.log('\n🛑 停止套利机器人...');

    try {
      // 关闭 WebSocket 连接
      await this.paradexAPI.close();
      await this.asterAPI.close();

      // 显示最终统计
      this.showFinalStats();

      console.log('✅ 套利机器人已停止');

    } catch (error) {
      console.error('❌ 停止时出错:', error.message);
    }
  }

  private showFinalStats(): void {
    console.log('\n📈 最终统计:');
    console.log('========================');
    this.showStats();

    console.log('\n📋 持仓明细:');
    this.positions.forEach(pos => {
      console.log(`   ${pos.id}: ${pos.status} 价差$${pos.spread.toFixed(2)} 时间${new Date(pos.openTime).toLocaleTimeString()}`);
    });
  }
}

// 运行机器人
async function main() {
  const bot = new ParadexAsterBot();

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

export default ParadexAsterBot;