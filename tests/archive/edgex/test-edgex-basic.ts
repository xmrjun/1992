#!/usr/bin/env node

/**
 * 基础EdgeX WebSocket连接测试
 * 测试返回200响应的URL
 */

import WebSocket from 'ws';

console.log('🧪 基础EdgeX WebSocket测试');
console.log('========================\n');

const wsURL = 'wss://pro.edgex.exchange/ws';
console.log(`🔌 连接到: ${wsURL}`);

const ws = new WebSocket(wsURL, {
  headers: {
    'User-Agent': 'EdgeX-Client/1.0',
    'Origin': 'https://pro.edgex.exchange'
  }
});

let messageCount = 0;
let connected = false;

ws.on('open', () => {
  console.log('✅ WebSocket连接成功！');
  connected = true;

  // 发送简单的ping或者基础消息
  console.log('📤 发送ping消息');
  ws.send('ping');

  // 也尝试发送JSON格式的消息
  setTimeout(() => {
    const message = {
      method: 'subscribe',
      params: ['ticker.BTCUSD'],
      id: 1
    };
    console.log('📤 发送订阅消息:', JSON.stringify(message));
    ws.send(JSON.stringify(message));
  }, 1000);
});

ws.on('message', (data) => {
  messageCount++;
  console.log(`📥 [${messageCount}] 收到消息:`, data.toString());

  try {
    const message = JSON.parse(data.toString());
    console.log('📊 解析后的JSON:', JSON.stringify(message, null, 2));
  } catch (error) {
    console.log('📥 非JSON消息');
  }

  // 收到消息就表示连接正常
  if (messageCount >= 3) {
    console.log('\n✅ 连接测试成功！');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (error) => {
  console.log('❌ WebSocket错误:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 WebSocket连接关闭: ${code} - ${reason.toString()}`);

  if (!connected) {
    console.log('❌ 连接失败');
  } else if (messageCount === 0) {
    console.log('❌ 连接成功但未收到消息');
  } else {
    console.log(`✅ 总共收到 ${messageCount} 条消息`);
  }

  process.exit(0);
});

// 10秒后超时
setTimeout(() => {
  console.log('\n⏰ 10秒超时');
  if (connected && messageCount === 0) {
    console.log('🔍 连接成功但服务器无响应，可能需要特定的订阅格式');
  }
  ws.close();
  process.exit(0);
}, 10000);

console.log('⏳ 等待连接...\n');