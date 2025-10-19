#!/usr/bin/env node

/**
 * 测试所有可能的 EdgeX WebSocket URL
 */

import WebSocket from 'ws';

const urls = [
  'wss://pro.edgex.exchange/api/v1/public/ws',
  'wss://pro.edgex.exchange/ws',
  'wss://pro.edgex.exchange/api/v1/ws',
  'wss://quote.edgex.exchange/api/v1/public/ws',
  'wss://quote.edgex.exchange/ws',
  'wss://ws.edgex.exchange',
  'wss://ws.edgex.exchange/api/v1/public/ws',
  'wss://api.edgex.exchange/api/v1/public/ws',
];

let currentIndex = 0;
let successUrl: string | null = null;

function testUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n🔌 [${currentIndex + 1}/${urls.length}] 测试: ${url}`);

    const ws = new WebSocket(url);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log('   ⏰ 超时');
        ws.terminate();
        resolve(false);
      }
    }, 5000);

    ws.on('open', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log('   ✅ 连接成功！');

        // 尝试订阅
        const sub = { type: 'subscribe', channel: 'ticker.10000001' };
        console.log('   📤 发送订阅:', JSON.stringify(sub));
        ws.send(JSON.stringify(sub));
      }
    });

    ws.on('message', (data) => {
      console.log('   📥 收到消息:', data.toString().substring(0, 200));
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        successUrl = url;
        ws.close();
        resolve(true);
      }
    });

    ws.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log('   ❌ 错误:', error.message);
        resolve(false);
      }
    });

    ws.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log('   🔌 连接关闭');
        resolve(false);
      }
    });
  });
}

async function testAllUrls() {
  console.log('🧪 EdgeX WebSocket URL 探测');
  console.log('============================');

  for (let i = 0; i < urls.length; i++) {
    currentIndex = i;
    const success = await testUrl(urls[i]);
    if (success) {
      console.log(`\n🎉 找到可用URL: ${successUrl}`);
      process.exit(0);
    }
  }

  console.log('\n❌ 所有URL都失败');
  process.exit(1);
}

testAllUrls();
