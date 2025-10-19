#!/usr/bin/env node

/**
 * EdgeX 简单WebSocket连接测试
 * 基于原有系统的WebSocket格式
 */

import WebSocket from 'ws';

console.log('🧪 EdgeX简单WebSocket测试');
console.log('=========================\n');

// 尝试不同的WebSocket URL
const wsURLs = [
  'wss://pro.edgex.exchange/ws',
  'wss://pro.edgex.exchange/api/v1/ws',
  'wss://pro.edgex.exchange/api/v1/public/ws',
  'wss://ws.edgex.exchange',
  'wss://quote.edgex.exchange'
];

let currentURLIndex = 0;

function tryNextURL() {
  if (currentURLIndex >= wsURLs.length) {
    console.log('❌ 所有WebSocket URL都尝试失败');
    process.exit(1);
  }

  const wsURL = wsURLs[currentURLIndex];
  console.log(`🔌 [${currentURLIndex + 1}/${wsURLs.length}] 尝试连接: ${wsURL}`);

  const ws = new WebSocket(wsURL);
  setupWebSocketHandlers(ws, wsURL);
}

function setupWebSocketHandlers(ws: WebSocket, wsURL: string) {
  let messageCount = 0;

  ws.on('open', () => {
    console.log(`✅ ${wsURL} 连接成功！`);

    // 基于你原有系统的订阅格式
    const subscribeMessage = {
      action: 'subscribe',
      channel: 'ticker',
      contractId: '10000001'
    };

    console.log('📤 发送订阅消息:', JSON.stringify(subscribeMessage));
    ws.send(JSON.stringify(subscribeMessage));

    // 等待消息5秒
    setTimeout(() => {
      if (messageCount === 0) {
        console.log('⏰ 5秒内未收到消息，尝试下一个URL...');
        ws.close();
      } else {
        console.log(`✅ ${wsURL} 测试成功！收到${messageCount}条消息`);
        process.exit(0);
      }
    }, 5000);
  });

  ws.on('message', (data) => {
    messageCount++;
    try {
      const message = JSON.parse(data.toString());
      console.log(`📥 [${messageCount}] 收到消息:`, JSON.stringify(message, null, 2));

      if (message.price || message.lastPrice || message.c) {
        const price = message.price || message.lastPrice || message.c;
        console.log(`💰 BTC价格: ${price} USD`);
      }
    } catch (error) {
      console.log(`📥 [${messageCount}] 收到非JSON消息:`, data.toString());
    }
  });

  ws.on('error', (error) => {
    console.log(`❌ ${wsURL} 错误:`, error.message);
    currentURLIndex++;
    setTimeout(tryNextURL, 1000);
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 ${wsURL} 连接关闭: ${code} - ${reason.toString()}`);
    if (messageCount === 0) {
      currentURLIndex++;
      setTimeout(tryNextURL, 1000);
    }
  });
}

// 开始测试
tryNextURL();