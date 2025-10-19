/**
 * 简化版 EdgeX-Paradex 套利机器人
 * 参考 aster-bot 设计，移除复杂的PositionManager
 */

import dotenv from 'dotenv';
import { SimpleTraderEdgex } from './utils/SimpleTraderEdgex';
import { tradeHistoryEdgex } from './utils/TradeHistoryEdgex';

// 加载环境变量
dotenv.config({ path: '.env.edgex' });
dotenv.config({ path: '.env.paradex' });

// 配置参数
const CONFIG = {
  tradeAmount: parseFloat(process.env.TRADE_AMOUNT || '0.005'),
  openThreshold: parseFloat(process.env.OPEN_THRESHOLD || '100'),
  closeThreshold: parseFloat(process.env.CLOSE_THRESHOLD || '40'),
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '5000'),
};

// 简化的交易器
const trader = new SimpleTraderEdgex();

// 当前价格
let edgexPrice: number = 0;
let paradexPrice: number = 0;

// 交易锁
let isTrading = false;

function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
  const timestamp = new Date().toLocaleString();
  const prefix = { info: '📊', success: '✅', error: '❌', warn: '⚠️' }[type];
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

/**
 * 价格检查和交易逻辑
 */
async function checkPricesAndTrade() {
  if (isTrading) return;

  try {
    isTrading = true;

    // 验证价格有效性
    if (edgexPrice <= 0 || paradexPrice <= 0) {
      return;
    }

    // 计算价差（Paradex - EdgeX）
    const priceDiff = paradexPrice - edgexPrice;
    const spreadAbs = Math.abs(priceDiff);

    // 查询实际持仓
    const hasPosition = await trader.hasOpenPositions();

    // 获取统计
    const stats = tradeHistoryEdgex.getTodayStats();

    // 显示状态
    log(
      `价差: $${priceDiff.toFixed(2)} (绝对值: $${spreadAbs.toFixed(2)}) | ` +
      `EdgeX: $${edgexPrice.toFixed(2)} | Paradex: $${paradexPrice.toFixed(2)} | ` +
      `持仓: ${hasPosition ? '有' : '无'} | 今日交易: ${stats.totalTrades}笔`,
      'info'
    );

    // 交易决策
    if (!hasPosition && spreadAbs >= CONFIG.openThreshold) {
      // 开仓
      if (priceDiff > 0) {
        // Paradex价格高 → Paradex做空，EdgeX做多
        log(`触发开仓: Paradex高 $${priceDiff.toFixed(2)} → Paradex做空+EdgeX做多`, 'success');
        await trader.openPosition('long_edgex_short_paradex', CONFIG.tradeAmount);
      } else {
        // EdgeX价格高 → EdgeX做空，Paradex做多
        log(`触发开仓: EdgeX高 $${Math.abs(priceDiff).toFixed(2)} → EdgeX做空+Paradex做多`, 'success');
        await trader.openPosition('short_edgex_long_paradex', CONFIG.tradeAmount);
      }
    } else if (hasPosition && spreadAbs <= CONFIG.closeThreshold) {
      // 平仓
      log(`触发平仓 (价差收敛: $${spreadAbs.toFixed(2)} <= $${CONFIG.closeThreshold})`, 'warn');
      await trader.closeAllPositions();
    }

  } catch (error: any) {
    log(`价格检查异常: ${error.message}`, 'error');
  } finally {
    isTrading = false;
  }
}

/**
 * 统计报告
 */
function printStats() {
  const stats = tradeHistoryEdgex.getTodayStats();
  console.log('\n=== 📊 今日交易统计 ===');
  console.log(`交易笔数: ${stats.totalTrades}`);
  console.log(`当前持仓: ${stats.openTrades}`);
  console.log(`今日盈亏: $${stats.totalPnL.toFixed(2)}`);
  console.log(`手续费: $${stats.totalFees.toFixed(2)}`);
  console.log(`胜率: ${stats.winRate.toFixed(1)}%`);
  console.log('========================\n');
}

/**
 * 主程序
 */
async function main() {
  log('🚀 启动简化版 EdgeX-Paradex 套利机器人', 'success');
  log(`交易参数: 数量=${CONFIG.tradeAmount} BTC | 开仓阈值=$${CONFIG.openThreshold} | 平仓阈值=$${CONFIG.closeThreshold}`, 'info');

  try {
    // 初始化交易器
    await trader.initialize();

    // 监听价格更新
    trader.on('edgex_price', (data: any) => {
      edgexPrice = data.mid;
    });

    trader.on('paradex_price', (data: any) => {
      paradexPrice = data.mid;
    });

    log('✅ 交易器初始化完成', 'success');

    // 显示初始统计
    printStats();

    // 主循环
    setInterval(checkPricesAndTrade, CONFIG.checkInterval);

    // 定期统计报告
    setInterval(printStats, 60000);

    log('✅ 套利机器人已启动，监听价差机会...', 'success');

  } catch (error: any) {
    log(`启动失败: ${error.message}`, 'error');
    process.exit(1);
  }
}

// 优雅退出
async function shutdown(signal: string) {
  log(`收到 ${signal} 信号，正在停止机器人...`, 'warn');

  try {
    await trader.close();
    printStats();
    log('机器人已安全停止', 'success');
    process.exit(0);
  } catch (error: any) {
    log(`停止机器人时出错: ${error.message}`, 'error');
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  log(`未处理的Promise拒绝: ${reason}`, 'error');
});

process.on('uncaughtException', (error) => {
  log(`未捕获的异常: ${error.message}`, 'error');
  shutdown('uncaughtException');
});

// 启动
main();
