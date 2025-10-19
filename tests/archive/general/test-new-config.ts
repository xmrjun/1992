#!/usr/bin/env node

/**
 * 测试新配置：0.02 BTC，开仓80+，平仓20以下
 */

import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';
import { Aster } from './exchanges/aster.js';
import { ARB_THRESHOLD, CLOSE_DIFF, TRADE_AMOUNT } from './edgex-config.js';

// 加载环境变量
dotenv.config({ path: '.env.edgex' });

console.log('⚙️ 新配置测试');
console.log('===============\n');
console.log(`📋 交易配置:`);
console.log(`   交易量: ${TRADE_AMOUNT} BTC`);
console.log(`   开仓阈值: $${ARB_THRESHOLD}`);
console.log(`   平仓阈值: $${CLOSE_DIFF}`);
console.log('');

class NewConfigTest {
  private edgexAPI: EdgexAPI;
  private asterAPI: Aster;
  private edgexPrice: number = 0;
  private asterPrice: number = 0;
  private opportunities: number = 0;
  private bestSpread: number = 0;

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

  async startTest(): Promise<void> {
    console.log('🚀 启动价格监控...\n');

    // 启动EdgeX WebSocket
    await this.edgexAPI.connectWebSocket((price) => {
      this.edgexPrice = price;
      this.analyzeOpportunity();
    });

    // 启动AsterDX WebSocket
    await this.asterAPI.watchTicker('BTCUSDT', (ticker) => {
      if (ticker && ticker.lastPrice) {
        this.asterPrice = parseFloat(ticker.lastPrice);
        this.analyzeOpportunity();
      }
    });

    console.log('✅ WebSocket连接已建立');
    console.log(`⏳ 监控套利机会中... (阈值: $${ARB_THRESHOLD})\n`);
  }

  private analyzeOpportunity(): void {
    if (this.edgexPrice > 0 && this.asterPrice > 0) {
      const spread = Math.abs(this.edgexPrice - this.asterPrice);
      const spreadPercent = (spread / this.edgexPrice) * 100;
      const higher = this.edgexPrice > this.asterPrice ? 'EdgeX' : 'AsterDEX';
      const lower = this.edgexPrice > this.asterPrice ? 'AsterDEX' : 'EdgeX';

      // 更新最佳价差
      if (spread > this.bestSpread) {
        this.bestSpread = spread;
      }

      const time = new Date().toLocaleTimeString();

      // 检查是否达到开仓阈值
      if (spread >= ARB_THRESHOLD) {
        this.opportunities++;
        console.log(`🎯 [${time}] 套利机会 #${this.opportunities}:`);
        console.log(`   价差: $${spread.toFixed(2)} (${spreadPercent.toFixed(3)}%)`);
        console.log(`   策略: ${higher}开空 + ${lower}开多`);
        console.log(`   交易量: ${TRADE_AMOUNT} BTC`);
        console.log(`   预期收益: $${(spread * TRADE_AMOUNT).toFixed(2)}`);
        console.log(`   平仓目标: 价差降至$${CLOSE_DIFF}以下`);
        console.log('   ' + '🟢'.repeat(20));
      } else {
        // 显示当前价差
        process.stdout.write(`\r📊 [${time}] 当前价差: $${spread.toFixed(2)} | 最佳: $${this.bestSpread.toFixed(2)} | 机会: ${this.opportunities}次`);
      }
    }
  }

  showSummary(): void {
    console.log('\n\n📈 测试总结:');
    console.log(`套利机会次数: ${this.opportunities}`);
    console.log(`最大价差: $${this.bestSpread.toFixed(2)}`);
    console.log(`配置评估: ${this.opportunities > 0 ? '✅ 有效' : '❌ 阈值过高'}`);
    console.log('');

    if (this.opportunities === 0) {
      console.log('💡 建议:');
      console.log(`   当前最大价差 $${this.bestSpread.toFixed(2)} < 开仓阈值 $${ARB_THRESHOLD}`);
      console.log(`   可考虑降低开仓阈值至 $${Math.ceil(this.bestSpread * 0.8)}`);
    }
  }

  async stop(): Promise<void> {
    await this.edgexAPI.closeWebSocket();
    await this.asterAPI.close();
    this.showSummary();
  }
}

// 运行测试
async function main() {
  const test = new NewConfigTest();

  try {
    await test.startTest();

    // 测试2分钟
    setTimeout(async () => {
      console.log('\n\n⏰ 2分钟测试结束');
      await test.stop();
      process.exit(0);
    }, 2 * 60 * 1000);

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 处理中断信号
process.on('SIGINT', async () => {
  console.log('\n🛑 用户中断测试...');
  process.exit(0);
});

// 启动测试
main().catch(error => {
  console.error('❌ 程序执行失败:', error.message);
  process.exit(1);
});