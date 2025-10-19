#!/usr/bin/env node

/**
 * 基于EdgeX SDK研究结果的正确WebSocket测试
 */

import WebSocket from 'ws';

console.log('🧪 EdgeX正确WebSocket测试');
console.log('基于SDK研究结果');
console.log('==========================\n');

// 基于SDK研究的正确WebSocket URL
const wsURL = 'wss://quote-testnet.edgex.exchange';

console.log(`🔌 连接到: ${wsURL}`);

const ws = new WebSocket(wsURL);

let messageCount = 0;

ws.on('open', () => {
  console.log('✅ WebSocket连接成功！');

  // 基于SDK研究的正确订阅格式
  const subscribeMessage = {
    type: 'subscribe',
    channel: 'ticker.10000001',  // BTC合约ID
    params: {
      contractId: '10000001'
    }
  };

  console.log('📤 发送订阅消息:', JSON.stringify(subscribeMessage));
  ws.send(JSON.stringify(subscribeMessage));

  // 5秒后如果没消息就退出
  setTimeout(() => {
    if (messageCount === 0) {
      console.log('⏰ 5秒内未收到消息');
      ws.close();
    }
  }, 5000);
});

ws.on('message', (data) => {
  messageCount++;
  try {
    const message = JSON.parse(data.toString());
    console.log(`📥 [${messageCount}] 收到消息:`);
    console.log(JSON.stringify(message, null, 2));

    // 检查是否是ticker数据
    if (message.type === 'quote-event' && message.channel?.includes('ticker')) {
      const content = message.content;
      if (content && content.data) {
        const tickerData = Array.isArray(content.data) ? content.data[0] : content.data;
        if (tickerData && tickerData.lastPrice) {
          console.log(`💰 BTC价格: $${tickerData.lastPrice}`);
        }
      }
    }

    // 收到3条消息后退出
    if (messageCount >= 3) {
      console.log('\n✅ 已接收3条消息，测试完成！');
      ws.close();
      process.exit(0);
    }

  } catch (error) {
    console.log(`📥 [${messageCount}] 收到非JSON消息:`, data.toString());
  }
});

ws.on('error', (error) => {
  console.log('❌ WebSocket错误:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 WebSocket连接关闭: ${code} - ${reason.toString()}`);

  if (messageCount === 0) {
    console.log('❌ 未收到任何消息');
  } else {
    console.log(`✅ 总共收到 ${messageCount} 条消息`);
  }

  process.exit(0);
});

// 10秒后超时退出
setTimeout(() => {
  console.log('\n⏰ 10秒超时，测试结束');
  console.log(`📊 总共收到 ${messageCount} 条消息`);
  ws.close();
  process.exit(0);
}, 10000);

console.log('⏳ 等待WebSocket数据...\n');