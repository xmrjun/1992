#!/usr/bin/env node

/**
 * EdgeX WebSocket 测试 - 按照官方文档修复后的版本
 * 官方文档: https://edgex-1.gitbook.io/edgeX-documentation
 */

import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';

dotenv.config({ path: '.env.edgex' });

console.log('🧪 EdgeX WebSocket 官方格式测试');
console.log('=================================\n');

async function testEdgexWebSocket() {
  try {
    // 初始化 EdgeX API
    const edgex = new EdgexAPI({
      apiKey: process.env.EDGEX_API_KEY!,
      privateKey: process.env.EDGEX_PRIVATE_KEY!,
      publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y!
    });

    console.log('📋 测试配置:');
    console.log(`   WebSocket URL: wss://pro.edgex.exchange/api/v1/public/ws`);
    console.log(`   合约ID: 10000001 (BTC-USD-PERP)`);
    console.log(`   订阅格式: {"type": "subscribe", "channel": "ticker.10000001"}\n`);

    // 连接 WebSocket 并监听价格
    let priceCount = 0;
    let lastUpdateTime = Date.now();

    await edgex.connectWebSocket((price) => {
      priceCount++;
      const now = Date.now();
      const interval = now - lastUpdateTime;
      lastUpdateTime = now;

      console.log(`\n💰 [${priceCount}] BTC价格: ${price.toFixed(2)} USD`);
      console.log(`   更新间隔: ${interval}ms`);
      console.log(`   时间: ${new Date().toLocaleTimeString()}`);
    });

    console.log('✅ WebSocket连接成功，等待数据...\n');
    console.log('按 Ctrl+C 停止测试\n');

    // 定期显示状态
    setInterval(() => {
      const isConnected = edgex.isWebSocketConnected();
      const lastPrice = edgex.getLastPrice();

      console.log('\n📊 连接状态:');
      console.log(`   WebSocket: ${isConnected ? '✅ 已连接' : '❌ 已断开'}`);
      console.log(`   最新价格: ${lastPrice > 0 ? lastPrice.toFixed(2) + ' USD' : '等待中...'}`);
      console.log(`   收到价格更新: ${priceCount} 次`);
      console.log(`   上次更新: ${new Date(lastUpdateTime).toLocaleTimeString()}`);
    }, 30000); // 每30秒显示一次状态

    // 测试时长 (5分钟)
    setTimeout(async () => {
      console.log('\n⏰ 测试完成 (5分钟)');
      console.log(`\n📈 测试结果:`);
      console.log(`   总价格更新: ${priceCount} 次`);
      console.log(`   最终价格: ${edgex.getLastPrice().toFixed(2)} USD`);

      await edgex.closeWebSocket();
      process.exit(0);
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 信号处理
process.on('SIGINT', async () => {
  console.log('\n\n🛑 收到停止信号，正在关闭...');
  process.exit(0);
});

// 运行测试
testEdgexWebSocket();
