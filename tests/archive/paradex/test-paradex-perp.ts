#!/usr/bin/env node

/**
 * 测试 Paradex BTC-USD-PERP WebSocket 连接
 */

import { Paradex } from './exchanges/paradex.js';

console.log('🚀 Paradex BTC-USD-PERP WebSocket 测试');
console.log('=====================================\n');

class ParadexPerpTest {
  private paradexAPI: Paradex;
  private priceCount: number = 0;
  private startTime: number = Date.now();

  constructor() {
    this.paradexAPI = new Paradex({
      sandbox: true
    });
  }

  async startTest(): Promise<void> {
    console.log('📡 测试 Paradex 永续合约连接...\n');

    try {
      // 加载市场
      console.log('🔍 加载 Paradex 市场...');
      const markets = await this.paradexAPI.loadMarkets();
      console.log(`✅ 找到 ${Object.keys(markets).length} 个交易对`);

      // 查找永续合约
      const perpetuals = Object.keys(markets).filter(s => s.includes('PERP'));
      const btcPerp = perpetuals.find(s => s.includes('BTC')) || 'BTC-USD-PERP';

      console.log(`永续合约: ${perpetuals.slice(0, 3).join(', ')}${perpetuals.length > 3 ? '...' : ''}`);
      console.log(`使用交易对: ${btcPerp}\n`);

      // 获取一次价格
      console.log('📊 获取当前价格...');
      const ticker = await this.paradexAPI.fetchTicker(btcPerp);
      console.log(`当前价格: $${ticker.lastPrice}`);
      console.log(`买价: $${ticker.bid || 'N/A'}`);
      console.log(`卖价: $${ticker.ask || 'N/A'}\n`);

      // 启动 WebSocket
      console.log('🔌 启动 WebSocket 实时监听...');
      await this.paradexAPI.watchTicker(btcPerp, (ticker) => {
        this.priceCount++;
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

        console.log(`📊 [${elapsed}s] 价格更新 #${this.priceCount}:`);
        console.log(`   ${ticker.symbol}: $${ticker.lastPrice}`);
        console.log(`   买价: $${ticker.bid || 'N/A'} | 卖价: $${ticker.ask || 'N/A'}`);
        console.log(`   时间: ${new Date(ticker.timestamp).toLocaleTimeString()}`);
        console.log('   ' + '🚀'.repeat(8));
      });

      console.log('✅ WebSocket 连接已建立\n');

    } catch (error) {
      console.error('❌ 测试失败:', error.message);
      throw error;
    }
  }

  showSummary(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log('\n📈 测试结果:');
    console.log(`⏱️  测试时长: ${elapsed}秒`);
    console.log(`📊 价格更新: ${this.priceCount}次`);
    console.log(`🔌 连接状态: ${this.paradexAPI.isWebSocketConnected() ? '✅ 活跃' : '❌ 断开'}`);
    console.log(`📈 更新频率: ${this.priceCount > 0 ? (this.priceCount / parseFloat(elapsed)).toFixed(2) : '0'} 次/秒`);
    console.log(`\n🎯 结论: Paradex WebSocket ${this.priceCount > 0 ? '✅ 正常工作' : '❌ 无数据'}`);
  }

  async stop(): Promise<void> {
    console.log('\n🛑 停止测试...');
    await this.paradexAPI.close();
    this.showSummary();
  }
}

// 运行测试
async function main() {
  const test = new ParadexPerpTest();

  try {
    await test.startTest();

    // 测试45秒
    setTimeout(async () => {
      console.log('\n⏰ 测试完成');
      await test.stop();
      process.exit(0);
    }, 45 * 1000);

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    await test.stop();
    process.exit(1);
  }
}

// 处理中断
process.on('SIGINT', async () => {
  console.log('\n🛑 用户中断测试...');
  process.exit(0);
});

main().catch(console.error);