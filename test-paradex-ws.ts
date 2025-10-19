#!/usr/bin/env node

/**
 * Paradex WebSocket 测试脚本
 * 测试 Python WebSocket 服务和 TypeScript Wrapper
 */

import ParadexWebSocketClient from './paradex-ws-client.js';
import dotenv from 'dotenv';

// 加载配置
dotenv.config({ path: '/root/aster-bot/.env.paradex' });

async function testParadexWebSocket() {
  console.log('🧪 Paradex WebSocket 测试开始');
  console.log('=====================================\n');

  const client = new ParadexWebSocketClient({
    l1Address: process.env.PARADEX_L1_ADDRESS,
    l2PrivateKey: process.env.PARADEX_L2_PRIVATE_KEY,
    market: 'BTC-USD-PERP',
    testnet: process.env.PARADEX_TESTNET !== 'false'
  });

  // 统计数据
  let priceUpdateCount = 0;
  let lastPrice = 0;
  let startTime = Date.now();

  try {
    // 监听事件
    client.on('connected', (data) => {
      console.log('✅ WebSocket 连接事件触发');
      console.log(`   L2地址: ${data.l2_address}`);
      console.log(`   市场: ${data.market}`);
      console.log(`   环境: ${data.env}`);
    });

    client.on('ready', () => {
      console.log('🎯 WebSocket 服务就绪，开始接收数据...\n');
    });

    client.on('price', (price: number) => {
      priceUpdateCount++;
      const now = new Date().toLocaleTimeString();
      const change = lastPrice > 0 ? ((price - lastPrice) / lastPrice * 100).toFixed(3) : '0.000';
      const changeSymbol = parseFloat(change) > 0 ? '📈' : parseFloat(change) < 0 ? '📉' : '➡️';

      console.log(`[${now}] ${changeSymbol} BTC价格: $${price.toFixed(2)} (变化: ${change}%)`);
      lastPrice = price;
    });

    client.on('ticker', (data: any) => {
      if (priceUpdateCount === 1) {
        // 首次收到数据时显示详细信息
        console.log('\n📊 完整Ticker数据:');
        console.log(`   买价: $${data.bid.toFixed(2)} (数量: ${data.bid_size})`);
        console.log(`   卖价: $${data.ask.toFixed(2)} (数量: ${data.ask_size})`);
        console.log(`   中间价: $${data.mid.toFixed(2)}`);
        console.log(`   价差: $${data.spread.toFixed(2)}\n`);
      }
    });

    client.on('orderbook', (data: any) => {
      console.log('📚 订单簿更新');
    });

    client.on('account', (data: any) => {
      console.log('💰 账户更新:', data);
    });

    client.on('positions', (data: any) => {
      console.log('📊 持仓更新:', data);
    });

    client.on('orders', (data: any) => {
      console.log('📋 订单更新:', data);
    });

    client.on('error', (error: Error) => {
      console.error('❌ WebSocket 错误:', error.message);
    });

    client.on('disconnected', () => {
      console.log('🔌 WebSocket 断开连接');
    });

    // 连接 WebSocket
    console.log('🔌 正在连接 Paradex WebSocket...\n');
    const connected = await client.connect();

    if (!connected) {
      console.error('❌ 连接失败');
      process.exit(1);
    }

    // 监听价格
    client.watchTicker('BTC-USD-PERP', (price) => {
      // 回调方式（可选，事件监听已处理）
    });

    // 定期显示统计信息
    setInterval(() => {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      const avgRate = uptime > 0 ? (priceUpdateCount / uptime).toFixed(2) : '0.00';

      console.log('\n📊 统计信息:');
      console.log(`   运行时间: ${uptime}秒`);
      console.log(`   价格更新次数: ${priceUpdateCount}`);
      console.log(`   平均更新频率: ${avgRate} 次/秒`);
      console.log(`   当前价格: $${lastPrice.toFixed(2)}`);
      console.log(`   连接状态: ${client.isWebSocketConnected() ? '✅ 已连接' : '❌ 已断开'}\n`);
    }, 30000); // 每30秒显示一次

    // 保持运行（使用 Ctrl+C 退出）
    console.log('💡 提示: 按 Ctrl+C 停止测试\n');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    await client.close();
    process.exit(1);
  }
}

// 优雅退出
let isExiting = false;
async function gracefulShutdown(client: any) {
  if (isExiting) return;
  isExiting = true;

  console.log('\n\n⚠️ 收到退出信号，正在关闭...');
  try {
    await client.close();
    console.log('✅ 测试完成');
    process.exit(0);
  } catch (error) {
    console.error('❌ 关闭错误:', error);
    process.exit(1);
  }
}

// 运行测试
testParadexWebSocket().then((client) => {
  // 监听退出信号
  process.on('SIGINT', () => gracefulShutdown(client));
  process.on('SIGTERM', () => gracefulShutdown(client));
}).catch(error => {
  console.error('❌ 启动测试失败:', error);
  process.exit(1);
});
