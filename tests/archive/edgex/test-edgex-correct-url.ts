#!/usr/bin/env node

/**
 * 使用正确EdgeX WebSocket URL和格式的测试
 * 基于你提供的详细信息
 */

import WebSocket from 'ws';

console.log('🧪 EdgeX正确WebSocket测试');
console.log('使用正确URL和订阅格式');
console.log('========================\n');

// 正确的EdgeX WebSocket URL (带完整路径)
const wsURL = 'wss://quote.edgex.exchange/api/v1/public/ws';
console.log(`🔌 连接到: ${wsURL}`);

const ws = new WebSocket(wsURL);
let messageCount = 0;

ws.on('open', () => {
  console.log('✅ EdgeX WebSocket连接成功！');

  // 发送正确的订阅消息
  const subscribeMessage = {
    type: 'subscribe',
    channel: 'ticker.10000001'  // BTC-USD合约ID
  };

  console.log('📤 发送订阅消息:', JSON.stringify(subscribeMessage));
  ws.send(JSON.stringify(subscribeMessage));

  // 也尝试订阅所有ticker
  setTimeout(() => {
    const subscribeAll = {
      type: 'subscribe',
      channel: 'ticker.all'
    };
    console.log('📤 发送全量订阅:', JSON.stringify(subscribeAll));
    ws.send(JSON.stringify(subscribeAll));
  }, 1000);
});

ws.on('message', (data) => {
  messageCount++;
  const message = data.toString();

  try {
    const parsed = JSON.parse(message);
    console.log(`📥 [${messageCount}] 收到消息:`, JSON.stringify(parsed, null, 2));

    // 处理心跳 ping/pong
    if (parsed.type === 'ping') {
      const pongMessage = {
        type: 'pong',
        time: parsed.time
      };
      console.log('💓 收到ping，发送pong:', JSON.stringify(pongMessage));
      ws.send(JSON.stringify(pongMessage));
      return;
    }

    // 处理ticker数据
    if (parsed.type === 'ticker' || parsed.channel?.includes('ticker')) {
      const tickerData = parsed.data || parsed;
      if (tickerData.price || tickerData.lastPrice) {
        const price = tickerData.price || tickerData.lastPrice;
        console.log(`💰 BTC价格更新: $${price}`);
      }
    }

    // 收到5条消息后关闭
    if (messageCount >= 5 && parsed.type !== 'ping') {
      console.log(`\n✅ 测试成功！收到${messageCount}条消息`);
      ws.close();
      process.exit(0);
    }

  } catch (error) {
    console.log(`📥 [${messageCount}] 非JSON消息:`, message);
  }
});

ws.on('error', (error) => {
  console.log('❌ WebSocket错误:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 WebSocket连接关闭: ${code} - ${reason.toString()}`);

  if (messageCount === 0) {
    console.log('❌ 未收到任何消息，可能订阅格式错误');
  } else {
    console.log(`✅ 总共收到 ${messageCount} 条消息`);
  }

  process.exit(0);
});

// 15秒后超时
setTimeout(() => {
  console.log('\n⏰ 15秒超时测试结束');
  console.log(`📊 总共收到 ${messageCount} 条消息`);
  if (messageCount > 0) {
    console.log('✅ EdgeX WebSocket连接成功！');
  }
  ws.close();
  process.exit(0);
}, 15000);

console.log('⏳ 等待EdgeX WebSocket数据...\n');