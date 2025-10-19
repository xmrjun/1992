#!/usr/bin/env node

/**
 * 测试 Paradex WebSocket 连接和价格获取
 */

import { Paradex } from './exchanges/paradex.js';

console.log('🚀 Paradex WebSocket 测试');
console.log('==========================\n');

class ParadexWebSocketTest {
  private paradexAPI: Paradex;
  private priceCount: number = 0;
  private startTime: number = Date.now();

  constructor() {
    // 使用沙箱模式测试
    this.paradexAPI = new Paradex({
      sandbox: true
    });
  }

  async startTest(): Promise<void> {
    console.log('📡 测试 Paradex WebSocket 连接...\n');

    try {
      // 先加载市场
      console.log('🔍 加载 Paradex 市场...');
      const markets = await this.paradexAPI.loadMarkets();
      console.log(`✅ 找到 ${Object.keys(markets).length} 个交易对`);

      // 查找 BTC 相关交易对
      const btcSymbols = Object.keys(markets).filter(s => s.includes('BTC'));
      console.log(`BTC 交易对: ${btcSymbols.slice(0, 5).join(', ')}${btcSymbols.length > 5 ? '...' : ''}`);

      const symbol = btcSymbols[0] || 'BTC-USD-PERP';
      console.log(`使用交易对: ${symbol}\n`);

      // 测试连接
      console.log('🔍 测试 API 连接...');
      const connected = await this.paradexAPI.testConnection();

      if (!connected) {
        console.log('❌ API 连接失败，但继续测试 WebSocket...\n');
      }

      // 测试 WebSocket 价格订阅
      console.log('🔌 启动 WebSocket 价格监听...');
      await this.paradexAPI.watchTicker(symbol, (ticker) => {
        this.priceCount++;
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

        console.log(`📊 [${elapsed}s] 价格更新 #${this.priceCount}:`);
        console.log(`   交易对: ${ticker.symbol}`);
        console.log(`   最新价: $${ticker.lastPrice}`);
        console.log(`   买价: $${ticker.bid || 'N/A'}`);
        console.log(`   卖价: $${ticker.ask || 'N/A'}`);
        console.log(`   时间: ${new Date(ticker.timestamp).toLocaleTimeString()}`);
        console.log('   ' + '📈'.repeat(10));
      });

      console.log('✅ WebSocket 连接已建立，监听价格中...\n');

    } catch (error) {
      console.error('❌ WebSocket 测试失败:', error.message);
      throw error;
    }
  }

  showSummary(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log('\n📈 测试总结:');
    console.log(`测试时长: ${elapsed}秒`);
    console.log(`价格更新: ${this.priceCount}次`);
    console.log(`连接状态: ${this.paradexAPI.isWebSocketConnected() ? '✅ 已连接' : '❌ 未连接'}`);
    console.log(`更新频率: ${this.priceCount > 0 ? (this.priceCount / parseFloat(elapsed)).toFixed(1) : '0'} 次/秒`);
  }

  async stop(): Promise<void> {
    console.log('\n🛑 停止 WebSocket 连接...');
    await this.paradexAPI.close();
    this.showSummary();
  }
}

// 运行测试
async function main() {
  const test = new ParadexWebSocketTest();

  try {
    await test.startTest();

    // 测试1分钟
    setTimeout(async () => {
      console.log('\n⏰ 1分钟测试结束');
      await test.stop();
      process.exit(0);
    }, 60 * 1000);

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    await test.stop();
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