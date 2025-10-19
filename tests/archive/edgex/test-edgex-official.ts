#!/usr/bin/env node

/**
 * 使用EdgeX官方WebSocket URL的测试
 * 基于EdgeX网站配置中发现的正确URL
 */

import WebSocket from 'ws';

console.log('🧪 EdgeX官方WebSocket测试');
console.log('基于EdgeX网站配置发现的URL');
console.log('==============================\n');

// EdgeX官方配置中的WebSocket URLs
const urls = [
  {
    name: 'EdgeX主网',
    url: 'wss://quote.edgex.exchange',
    env: 'mainnet'
  },
  {
    name: 'EdgeX测试网',
    url: 'wss://quote-testnet.edgex.exchange',
    env: 'testnet'
  }
];

let currentIndex = 0;

function testWebSocketURL(urlConfig: typeof urls[0]) {
  console.log(`🔌 测试 ${urlConfig.name}: ${urlConfig.url}`);

  const ws = new WebSocket(urlConfig.url);
  let messageCount = 0;
  let connected = false;

  ws.on('open', () => {
    console.log(`✅ ${urlConfig.name} 连接成功！`);
    connected = true;

    // 基于EdgeX的WebSocket格式发送订阅消息
    // 尝试多种可能的订阅格式
    const subscriptions = [
      // 格式1: 简单订阅
      {
        type: 'subscribe',
        channel: 'ticker.BTCUSD'
      },
      // 格式2: 带参数的订阅
      {
        action: 'subscribe',
        channel: 'ticker',
        symbol: 'BTCUSD'
      },
      // 格式3: 基于合约ID
      {
        type: 'subscribe',
        channel: 'ticker.10000001'
      }
    ];

    subscriptions.forEach((sub, index) => {
      setTimeout(() => {
        console.log(`📤 发送订阅消息 ${index + 1}:`, JSON.stringify(sub));
        ws.send(JSON.stringify(sub));
      }, (index + 1) * 1000);
    });

    // 5秒后检查结果
    setTimeout(() => {
      if (messageCount === 0) {
        console.log(`⏰ ${urlConfig.name} 5秒内未收到消息`);
        ws.close();
      } else {
        console.log(`✅ ${urlConfig.name} 接收到${messageCount}条消息！`);
        // 不立即关闭，继续接收更多消息来分析格式
      }
    }, 5000);
  });

  ws.on('message', (data) => {
    messageCount++;
    const message = data.toString();

    console.log(`📥 [${urlConfig.name}] [${messageCount}] 收到消息:`);
    console.log(message);

    try {
      const parsed = JSON.parse(message);
      console.log(`📊 [${urlConfig.name}] 解析后的JSON:`, JSON.stringify(parsed, null, 2));

      // 查找价格信息
      if (parsed.price || parsed.lastPrice || parsed.c) {
        const price = parsed.price || parsed.lastPrice || parsed.c;
        console.log(`💰 [${urlConfig.name}] 发现价格: ${price}`);
      }

      // 查找嵌套的价格信息
      if (parsed.data && typeof parsed.data === 'object') {
        if (parsed.data.price || parsed.data.lastPrice) {
          const price = parsed.data.price || parsed.data.lastPrice;
          console.log(`💰 [${urlConfig.name}] 发现嵌套价格: ${price}`);
        }
      }

    } catch (error) {
      console.log(`📥 [${urlConfig.name}] 非JSON消息或解析失败`);
    }

    console.log('-'.repeat(50));

    // 接收到10条消息后测试下一个URL
    if (messageCount >= 10) {
      console.log(`✅ ${urlConfig.name} 测试完成，收到${messageCount}条消息`);
      ws.close();
    }
  });

  ws.on('error', (error) => {
    console.log(`❌ ${urlConfig.name} WebSocket错误:`, error.message);
    tryNextURL();
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 ${urlConfig.name} 连接关闭: ${code} - ${reason.toString()}`);

    if (connected && messageCount > 0) {
      console.log(`✅ ${urlConfig.name} 测试成功！收到${messageCount}条消息`);
      process.exit(0);
    } else if (!connected) {
      console.log(`❌ ${urlConfig.name} 连接失败`);
      tryNextURL();
    } else {
      console.log(`⚠️ ${urlConfig.name} 连接成功但无消息`);
      tryNextURL();
    }
  });

  // 10秒后超时
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log(`⏰ ${urlConfig.name} 10秒超时`);
      if (messageCount > 0) {
        console.log(`✅ ${urlConfig.name} 收到${messageCount}条消息后超时`);
        process.exit(0);
      } else {
        ws.close();
      }
    }
  }, 10000);
}

function tryNextURL() {
  currentIndex++;
  if (currentIndex >= urls.length) {
    console.log('\n❌ 所有EdgeX WebSocket URL测试完成');
    console.log('💡 可能需要特殊的认证或订阅格式');
    process.exit(1);
  }

  setTimeout(() => {
    console.log(`\n🔄 尝试下一个URL...`);
    testWebSocketURL(urls[currentIndex]);
  }, 2000);
}

// 开始测试
testWebSocketURL(urls[currentIndex]);