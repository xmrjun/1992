#!/usr/bin/env node

/**
 * EdgeX ↔ AsterDEX 套利交易机器人
 * 统一使用ccxt WebSocket方式
 */

import dotenv from 'dotenv';
import { Aster } from './exchanges/aster.js';
import EdgexAPI from './edgex-api.js';

// 加载EdgeX专用环境变量
dotenv.config({ path: '.env.edgex' });
import {
  EDGEX_TRADE_SYMBOL,
  ASTER_TRADE_SYMBOL,
  LEVERAGE,
  TRADE_AMOUNT,
  MAX_POSITION_SIZE,
  MAX_ADD_POSITIONS,
  ADD_POSITION_SPREAD,
  ARB_THRESHOLD,
  CLOSE_DIFF,
  PROFIT_DIFF_LIMIT,
  LOSS_LIMIT,
  MAX_SPREAD,
  TRADE_INTERVAL,
  MIN_TRADE_INTERVAL,
  DAILY_VOLUME_TARGET,
  DAILY_TRADES_TARGET,
  MAX_POSITION_COUNT,
  DAILY_LOSS_LIMIT,
  FORCE_CLOSE_TIME,
  OPEN_LOCK_DURATION,
  CLOSE_LOCK_DURATION,
  STOP_LOSS_DIST,
  TRAILING_PROFIT,
  TRAILING_CALLBACK_RATE,
  USE_WEBSOCKET,
  WS_RECONNECT_INTERVAL
} from './edgex-config.js';

dotenv.config();

interface TradeOpportunity {
  action: 'open' | 'close';
  edgexPrice: number;
  asterPrice: number;
  spread: number;
  direction: 'edgex_high' | 'aster_high';
  highExchange: string;
  lowExchange: string;
  highPrice: number;
  lowPrice: number;
}

class EdgexAsterBot {
  private edgexAPI: EdgexAPI;
  private asterAPI: Aster;

  // 交易状态
  private isRunning = false;
  private isTrading = false;
  private lastTradeTime = 0;
  private addCount = 0;
  private totalTrades = 0;
  private totalVolume = 0;

  // 持仓状态
  private edgexPosition = 0;
  private asterPosition = 0;
  private positionOpenTime = 0;
  private positionCloseTime = 0;

  // 价格数据
  private edgexPrice = 0;
  private asterPrice = 0;
  private lastPriceUpdate = 0;

  // 时间锁定
  private openLockTime = 0;
  private closeLockTime = 0;

  constructor() {
    // 初始化EdgeX API (使用原有认证方式)
    this.edgexAPI = new EdgexAPI({
      apiKey: process.env.EDGEX_API_KEY!,
      privateKey: process.env.EDGEX_PRIVATE_KEY!,
      publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y!
    });

    // 初始化AsterDEX API (EdgeX专用凭证)
    this.asterAPI = new Aster(
      process.env.EDGEX_ASTER_API_KEY!,
      process.env.EDGEX_ASTER_API_SECRET!,
      'BTCUSDT'
    );
  }

  // 获取两个交易所的价格
  async fetchPrices(): Promise<{ edgexPrice: number; asterPrice: number }> {
    try {
      // 优先使用WebSocket价格，fallback到REST API
      let edgexPrice = 0;
      let asterPrice = 0;

      // EdgeX价格获取
      if (this.edgexAPI.isWebSocketConnected()) {
        edgexPrice = this.edgexAPI.getLastPrice();
      } else {
        const edgexTicker = await this.edgexAPI.fetchTicker();
        edgexPrice = parseFloat(edgexTicker.last || edgexTicker.price || 0);
      }

      // AsterDX价格获取
      if (this.asterPrice > 0) {
        asterPrice = this.asterPrice;
      } else {
        const asterTicker = await this.asterAPI.getTicker('BTCUSDT');
        asterPrice = parseFloat(asterTicker.price || 0);
      }

      if (edgexPrice > 0 && asterPrice > 0) {
        this.edgexPrice = edgexPrice;
        this.asterPrice = asterPrice;
        this.lastPriceUpdate = Date.now();
      }

      return { edgexPrice: this.edgexPrice, asterPrice: this.asterPrice };
    } catch (error) {
      console.error('❌ 获取价格失败:', error.message);
      return { edgexPrice: this.edgexPrice, asterPrice: this.asterPrice };
    }
  }

  // 分析套利机会
  analyzeOpportunity(edgexPrice: number, asterPrice: number): TradeOpportunity | null {
    if (edgexPrice <= 0 || asterPrice <= 0) return null;

    const spread = Math.abs(edgexPrice - asterPrice);
    const now = Date.now();

    // 检查时间锁定
    if (now < this.openLockTime || now < this.closeLockTime) {
      return null;
    }

    // 检查是否有持仓
    const hasPosition = this.addCount > 0;

    if (!hasPosition) {
      // 无持仓 - 检查开仓机会
      if (spread >= ARB_THRESHOLD && spread <= MAX_SPREAD) {
        return {
          action: 'open',
          edgexPrice,
          asterPrice,
          spread,
          direction: edgexPrice > asterPrice ? 'edgex_high' : 'aster_high',
          highExchange: edgexPrice > asterPrice ? 'EdgeX' : 'AsterDEX',
          lowExchange: edgexPrice > asterPrice ? 'AsterDEX' : 'EdgeX',
          highPrice: Math.max(edgexPrice, asterPrice),
          lowPrice: Math.min(edgexPrice, asterPrice)
        };
      }
    } else {
      // 有持仓 - 检查平仓机会
      if (spread <= CLOSE_DIFF) {
        return {
          action: 'close',
          edgexPrice,
          asterPrice,
          spread,
          direction: edgexPrice > asterPrice ? 'edgex_high' : 'aster_high',
          highExchange: edgexPrice > asterPrice ? 'EdgeX' : 'AsterDEX',
          lowExchange: edgexPrice > asterPrice ? 'AsterDEX' : 'EdgeX',
          highPrice: Math.max(edgexPrice, asterPrice),
          lowPrice: Math.min(edgexPrice, asterPrice)
        };
      }

      // 检查强制平仓时间
      if (this.positionOpenTime > 0 && now - this.positionOpenTime > FORCE_CLOSE_TIME) {
        console.log('⏰ 持仓时间超限，强制平仓');
        return {
          action: 'close',
          edgexPrice,
          asterPrice,
          spread,
          direction: edgexPrice > asterPrice ? 'edgex_high' : 'aster_high',
          highExchange: edgexPrice > asterPrice ? 'EdgeX' : 'AsterDEX',
          lowExchange: edgexPrice > asterPrice ? 'AsterDEX' : 'EdgeX',
          highPrice: Math.max(edgexPrice, asterPrice),
          lowPrice: Math.min(edgexPrice, asterPrice)
        };
      }

      // 检查加仓机会
      if (this.addCount < MAX_ADD_POSITIONS) {
        const addThreshold = ARB_THRESHOLD + (this.addCount * ADD_POSITION_SPREAD);
        const currentPosition = this.addCount * TRADE_AMOUNT;

        if (spread >= addThreshold && currentPosition + TRADE_AMOUNT <= MAX_POSITION_SIZE) {
          return {
            action: 'open',
            edgexPrice,
            asterPrice,
            spread,
            direction: edgexPrice > asterPrice ? 'edgex_high' : 'aster_high',
            highExchange: edgexPrice > asterPrice ? 'EdgeX' : 'AsterDEX',
            lowExchange: edgexPrice > asterPrice ? 'AsterDEX' : 'EdgeX',
            highPrice: Math.max(edgexPrice, asterPrice),
            lowPrice: Math.min(edgexPrice, asterPrice)
          };
        }
      }
    }

    return null;
  }

  // 执行套利策略
  async executeArbitrage(opportunity: TradeOpportunity): Promise<boolean> {
    if (this.isTrading) return false;

    const now = Date.now();
    if (now - this.lastTradeTime < MIN_TRADE_INTERVAL) return false;

    this.isTrading = true;
    this.lastTradeTime = now;

    try {
      if (opportunity.action === 'open') {
        return await this.executeOpenStrategy(opportunity);
      } else {
        return await this.executeCloseStrategy(opportunity);
      }
    } catch (error) {
      console.error('❌ 执行套利失败:', error.message);
      return false;
    } finally {
      this.isTrading = false;
    }
  }

  // 执行开仓策略
  private async executeOpenStrategy(opportunity: TradeOpportunity): Promise<boolean> {
    console.log(`🔓 开仓策略 - 价差: ${opportunity.spread.toFixed(2)}U`);
    console.log(`   高价: ${opportunity.highExchange} ${opportunity.highPrice.toFixed(2)}`);
    console.log(`   低价: ${opportunity.lowExchange} ${opportunity.lowPrice.toFixed(2)}`);

    const executedTrades: Array<{ exchange: string; side: string; id?: string }> = [];
    let edgexSuccess = false;
    let asterSuccess = false;

    try {
      // 同时执行双向交易
      if (opportunity.highExchange === 'EdgeX') {
        // EdgeX高价开空，AsterDEX低价开多
        console.log(`🔴 EdgeX开空: ${TRADE_AMOUNT} BTC`);
        const edgexOrder = await this.edgexAPI.createMarketOrder(
          EDGEX_TRADE_SYMBOL,
          'sell',
          TRADE_AMOUNT
        );
        console.log(`✅ EdgeX空单成功: ${edgexOrder.id}`);
        edgexSuccess = true;
        executedTrades.push({ exchange: 'EdgeX', side: 'sell', id: edgexOrder.id });

        console.log(`🟢 AsterDEX开多: ${TRADE_AMOUNT} BTC`);
        const asterOrder = await this.asterAPI.createOrder({
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'MARKET',
          quantity: TRADE_AMOUNT
        });
        console.log(`✅ AsterDEX多单成功: ${asterOrder.id}`);
        asterSuccess = true;
        executedTrades.push({ exchange: 'AsterDEX', side: 'buy', id: asterOrder.id });
      } else {
        // AsterDEX高价开空，EdgeX低价开多
        console.log(`🔴 AsterDEX开空: ${TRADE_AMOUNT} BTC`);
        const asterOrder = await this.asterAPI.createOrder({
          symbol: 'BTCUSDT',
          side: 'SELL',
          type: 'MARKET',
          quantity: TRADE_AMOUNT
        });
        console.log(`✅ AsterDEX空单成功: ${asterOrder.id}`);
        asterSuccess = true;
        executedTrades.push({ exchange: 'AsterDEX', side: 'sell', id: asterOrder.id });

        console.log(`🟢 EdgeX开多: ${TRADE_AMOUNT} BTC`);
        const edgexOrder = await this.edgexAPI.createMarketOrder(
          EDGEX_TRADE_SYMBOL,
          'buy',
          TRADE_AMOUNT
        );
        console.log(`✅ EdgeX多单成功: ${edgexOrder.id}`);
        edgexSuccess = true;
        executedTrades.push({ exchange: 'EdgeX', side: 'buy', id: edgexOrder.id });
      }

      if (edgexSuccess && asterSuccess) {
        // 双向交易成功
        this.addCount += 1;
        this.totalTrades += 2;
        this.totalVolume += TRADE_AMOUNT * 2;
        this.positionOpenTime = Date.now();
        this.openLockTime = Date.now() + (OPEN_LOCK_DURATION * 1000);

        // 更新持仓记录
        if (opportunity.highExchange === 'EdgeX') {
          this.edgexPosition -= TRADE_AMOUNT;  // EdgeX开空
          this.asterPosition += TRADE_AMOUNT;  // AsterDEX开多
        } else {
          this.asterPosition -= TRADE_AMOUNT;  // AsterDEX开空
          this.edgexPosition += TRADE_AMOUNT;  // EdgeX开多
        }

        console.log(`✅ 双向套利成功! 当前加仓次数: ${this.addCount}`);
        console.log(`📊 持仓: EdgeX=${this.edgexPosition.toFixed(3)}, AsterDEX=${this.asterPosition.toFixed(3)}`);
        console.log(`🔒 开仓锁定 ${OPEN_LOCK_DURATION} 秒`);
        return true;
      } else {
        console.error('❌ 双向套利失败!');
        console.error(`EdgeX: ${edgexSuccess ? '✅' : '❌'}, AsterDEX: ${asterSuccess ? '✅' : '❌'}`);

        if (executedTrades.length > 0) {
          console.error('🚨 警告: 可能存在单边持仓风险!');
          console.error(`🚨 已执行交易: ${JSON.stringify(executedTrades)}`);
        }
        return false;
      }
    } catch (error) {
      console.error('❌ 开仓策略执行失败:', error.message);
      return false;
    }
  }

  // 执行平仓策略
  private async executeCloseStrategy(opportunity: TradeOpportunity): Promise<boolean> {
    console.log(`🔚 平仓策略 - 价差: ${opportunity.spread.toFixed(2)}U`);

    const closeSize = TRADE_AMOUNT * this.addCount;
    let success = true;

    try {
      // 平高价交易所的空单（买入平空）
      if (opportunity.highExchange === 'EdgeX') {
        console.log(`🔚 EdgeX平空(买入): ${closeSize} BTC`);
        const edgexOrder = await this.edgexAPI.createMarketOrder(
          EDGEX_TRADE_SYMBOL,
          'buy',
          closeSize,
          undefined,
          { reduceOnly: true }
        );
        console.log(`✅ EdgeX平空成功: ${edgexOrder.id}`);
      } else {
        console.log(`🔚 AsterDEX平空(买入): ${closeSize} BTC`);
        const asterOrder = await this.asterAPI.createOrder({
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'MARKET',
          quantity: closeSize,
          reduceOnly: 'true'
        });
        console.log(`✅ AsterDEX平空成功: ${asterOrder.id}`);
      }

      // 平低价交易所的多单（卖出平多）
      if (opportunity.lowExchange === 'EdgeX') {
        console.log(`🔚 EdgeX平多(卖出): ${closeSize} BTC`);
        const edgexOrder = await this.edgexAPI.createMarketOrder(
          EDGEX_TRADE_SYMBOL,
          'sell',
          closeSize,
          undefined,
          { reduceOnly: true }
        );
        console.log(`✅ EdgeX平多成功: ${edgexOrder.id}`);
      } else {
        console.log(`🔚 AsterDEX平多(卖出): ${closeSize} BTC`);
        const asterOrder = await this.asterAPI.createOrder({
          symbol: 'BTCUSDT',
          side: 'SELL',
          type: 'MARKET',
          quantity: closeSize,
          reduceOnly: 'true'
        });
        console.log(`✅ AsterDEX平多成功: ${asterOrder.id}`);
      }

      if (success) {
        // 重置状态
        const totalPosition = TRADE_AMOUNT * this.addCount;
        this.addCount = 0;
        this.totalTrades += 2;
        this.totalVolume += totalPosition * 2;
        this.positionCloseTime = Date.now();
        this.positionOpenTime = 0;
        this.closeLockTime = Date.now() + (CLOSE_LOCK_DURATION * 1000);

        // 清零持仓记录
        this.edgexPosition = 0;
        this.asterPosition = 0;

        console.log('✅ 平仓完成! 总持仓已清零');
        console.log(`🔒 平仓冷却 ${CLOSE_LOCK_DURATION} 秒`);
      }

      return success;
    } catch (error) {
      console.error('❌ 平仓策略执行失败:', error.message);
      return false;
    }
  }

  // 主交易循环
  async tradingLoop(): Promise<void> {
    try {
      // 获取价格
      const { edgexPrice, asterPrice } = await this.fetchPrices();

      if (edgexPrice > 0 && asterPrice > 0) {
        const spread = Math.abs(edgexPrice - asterPrice);

        // 显示价格和持仓信息
        const edgexPosStr = this.edgexPosition !== 0 ? `(${this.edgexPosition.toFixed(3)})` : '';
        const asterPosStr = this.asterPosition !== 0 ? `(${this.asterPosition.toFixed(3)})` : '';

        if (edgexPrice > asterPrice) {
          console.log(`📊 💰 EdgeX: ${edgexPrice.toFixed(2)}${edgexPosStr} | AsterDEX: ${asterPrice.toFixed(2)}${asterPosStr} | 价差: ${spread.toFixed(2)}U`);
        } else {
          console.log(`📊 💰 AsterDEX: ${asterPrice.toFixed(2)}${asterPosStr} | EdgeX: ${edgexPrice.toFixed(2)}${edgexPosStr} | 价差: ${spread.toFixed(2)}U`);
        }

        // 分析套利机会
        const opportunity = this.analyzeOpportunity(edgexPrice, asterPrice);

        if (opportunity) {
          await this.executeArbitrage(opportunity);
        }

        // 定期显示统计
        if (Math.floor(Date.now() / 1000) % 300 === 0) {
          console.log('\n=== 📊 EdgeX ↔ AsterDEX 交易统计 ===');
          console.log(`交易量: ${this.totalVolume.toFixed(4)} BTC`);
          console.log(`交易笔数: ${this.totalTrades}`);
          console.log(`当前持仓: ${this.addCount}次`);
          console.log('==================================\n');
        }
      }
    } catch (error) {
      // 静默处理错误，避免日志噪音
    }
  }

  // 启动机器人
  async start(): Promise<void> {
    console.log('\n🚀 启动 EdgeX ↔ AsterDEX 套利机器人');
    console.log('⚙️  配置参数:');
    console.log(`   开仓阈值: ${ARB_THRESHOLD}U`);
    console.log(`   平仓阈值: ${CLOSE_DIFF}U`);
    console.log(`   交易规模: ${TRADE_AMOUNT} BTC`);
    console.log(`   最大加仓: ${MAX_ADD_POSITIONS}次`);
    console.log(`   最大持仓: ${MAX_POSITION_SIZE} BTC`);
    console.log(`   时间锁定: 开仓${OPEN_LOCK_DURATION}s / 平仓${CLOSE_LOCK_DURATION}s`);
    console.log('📚 策略: 双WebSocket实时价格 + 原有API认证\n');

    this.isRunning = true;

    // 启动双WebSocket价格订阅
    if (USE_WEBSOCKET) {
      try {
        // 启动EdgeX WebSocket
        await this.edgexAPI.connectWebSocket((price) => {
          console.log(`📊 EdgeX实时价格: ${price.toFixed(2)} USD`);
        });
        console.log('✅ EdgeX WebSocket已连接');

        // 启动AsterDX WebSocket
        await this.asterAPI.watchTicker('BTCUSDT', (ticker) => {
          if (ticker && ticker.lastPrice) {
            const price = parseFloat(ticker.lastPrice);
            this.asterPrice = price;
            console.log(`📊 AsterDX实时价格: ${price.toFixed(2)} USDT`);
          }
        });
        console.log('✅ AsterDX WebSocket已连接');

      } catch (error) {
        console.log('⚠️ WebSocket连接失败，使用REST API');
      }
    }

    // 主循环
    while (this.isRunning) {
      await this.tradingLoop();
      await new Promise(resolve => setTimeout(resolve, TRADE_INTERVAL));
    }
  }

  // 停止机器人
  async stop(): Promise<void> {
    console.log('\n🛑 正在停止 EdgeX ↔ AsterDEX 套利机器人...');
    this.isRunning = false;

    try {
      await this.edgexAPI.closeWebSocket();
      await this.asterAPI.close();
    } catch (error) {
      console.error('关闭WebSocket连接时出错:', error.message);
    }

    console.log('✅ 机器人已停止\n');
    process.exit(0);
  }

  // 获取当前状态
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      isTrading: this.isTrading,
      addCount: this.addCount,
      totalTrades: this.totalTrades,
      totalVolume: this.totalVolume,
      edgexPosition: this.edgexPosition,
      asterPosition: this.asterPosition,
      edgexPrice: this.edgexPrice,
      asterPrice: this.asterPrice,
      lastUpdate: new Date(this.lastPriceUpdate).toISOString()
    };
  }
}

// 全局机器人实例
let bot: EdgexAsterBot | null = null;

// 启动函数
export async function startEdgexAsterBot(): Promise<void> {
  if (bot && bot.getStatus().isRunning) {
    console.log('⚠️ EdgeX ↔ AsterDEX 机器人已在运行中');
    return;
  }

  bot = new EdgexAsterBot();
  await bot.start();
}

// 停止函数
export async function stopEdgexAsterBot(): Promise<void> {
  if (bot) {
    await bot.stop();
    bot = null;
  } else {
    console.log('⚠️ EdgeX ↔ AsterDEX 机器人未运行');
  }
}

// 获取状态函数
export function getEdgexAsterBotStatus(): any {
  return bot ? bot.getStatus() : null;
}

// 信号处理
process.on('SIGINT', async () => {
  console.log('\n接收到停止信号...');
  await stopEdgexAsterBot();
});

process.on('SIGTERM', async () => {
  console.log('\n接收到终止信号...');
  await stopEdgexAsterBot();
});

// 主函数
async function main(): Promise<void> {
  await startEdgexAsterBot();
}

// 直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ 程序执行失败:', error);
    process.exit(1);
  });
}

export default EdgexAsterBot;