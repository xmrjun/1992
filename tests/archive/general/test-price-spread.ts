#!/usr/bin/env node

/**
 * EdgeX ↔ AsterDEX 价格差异监控
 * 简单测试两个交易所的价格差
 */

import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';
import { Aster } from './exchanges/aster.js';

// 加载环境变量
dotenv.config({ path: '.env.edgex' });

console.log('💰 EdgeX ↔ AsterDEX 价格差异监控');
console.log('===============================\n');

class PriceSpreadMonitor {
  private edgexAPI: EdgexAPI;
  private asterAPI: Aster;
  private edgexPrice: number = 0;
  private asterPrice: number = 0;

  constructor() {
    this.edgexAPI = new EdgexAPI({
      apiKey: process.env.EDGEX_API_KEY || 'test',
      privateKey: process.env.EDGEX_PRIVATE_KEY || 'test',
      publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y || 'test'
    });

    this.asterAPI = new Aster(
      process.env.EDGEX_ASTER_API_KEY || 'test',
      process.env.EDGEX_ASTER_API_SECRET || 'test',
      'BTCUSDT'
    );
  }

  async startMonitoring(): Promise<void> {
    console.log('🚀 启动价格监控...\n');

    // 启动EdgeX WebSocket
    try {
      await this.edgexAPI.connectWebSocket((price) => {
        this.edgexPrice = price;
        this.updateSpread();
      });
      console.log('✅ EdgeX WebSocket已连接');
    } catch (error) {
      console.log('❌ EdgeX WebSocket连接失败:', error.message);
    }

    // 启动AsterDX WebSocket
    try {
      await this.asterAPI.watchTicker('BTCUSDT', (ticker) => {
        if (ticker && ticker.lastPrice) {
          this.asterPrice = parseFloat(ticker.lastPrice);
          this.updateSpread();
        }
      });
      console.log('✅ AsterDX WebSocket已连接');
    } catch (error) {
      console.log('❌ AsterDX WebSocket连接失败:', error.message);
    }

    console.log('\n⏳ 等待价格数据...\n');
  }

  private updateSpread(): void {
    if (this.edgexPrice > 0 && this.asterPrice > 0) {
      const spread = Math.abs(this.edgexPrice - this.asterPrice);
      const spreadPercent = (spread / this.edgexPrice) * 100;
      const higher = this.edgexPrice > this.asterPrice ? 'EdgeX' : 'AsterDEX';
      const lower = this.edgexPrice > this.asterPrice ? 'AsterDEX' : 'EdgeX';

      const time = new Date().toLocaleTimeString();

      console.log(`[${time}] 💰 价格差异分析`);
      console.log(`   EdgeX:    $${this.edgexPrice.toFixed(2)}`);
      console.log(`   AsterDEX: $${this.asterPrice.toFixed(2)}`);
      console.log(`   价差:     $${spread.toFixed(2)} (${spreadPercent.toFixed(3)}%)`);
      console.log(`   方向:     ${higher} 高价 → ${lower} 低价`);

      // 套利机会提示
      if (spread > 50) {
        console.log(`   🎯 大价差! 超过$50`);
      } else if (spread > 20) {
        console.log(`   ⚡ 中等价差 $20-50`);
      } else {
        console.log(`   📊 正常价差 <$20`);
      }

      console.log('   ' + '='.repeat(50));
    }
  }

  async stop(): Promise<void> {
    console.log('\n🛑 停止价格监控...');
    try {
      await this.edgexAPI.closeWebSocket();
      await this.asterAPI.close();
      console.log('✅ 所有连接已关闭');
    } catch (error) {
      console.log('❌ 关闭连接时出错:', error.message);
    }
  }
}

// 运行监控
async function main() {
  const monitor = new PriceSpreadMonitor();

  try {
    await monitor.startMonitoring();

    // 监控5分钟
    setTimeout(async () => {
      console.log('\n⏰ 5分钟监控时间结束');
      await monitor.stop();
      process.exit(0);
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error('❌ 监控启动失败:', error.message);
    process.exit(1);
  }
}

// 处理中断信号
process.on('SIGINT', async () => {
  console.log('\n🛑 用户中断监控...');
  process.exit(0);
});

// 启动监控
main().catch(error => {
  console.error('❌ 程序执行失败:', error.message);
  process.exit(1);
});