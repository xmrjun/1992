import EdgexAPI from './edgex-api.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.edgex' });

async function testDepth() {
  const api = new EdgexAPI({
    starkPrivateKey: process.env.EDGEX_STARK_PRIVATE_KEY!,
    accountId: process.env.EDGEX_ACCOUNT_ID
  });

  console.log('🧪 测试EdgeX Depth数据格式\n');

  // 连接WebSocket
  await api.connectWebSocket();

  // 等待连接成功
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 订阅depth
  api.subscribeDepth('10000001', (depth) => {
    console.log('\n📚 收到Depth数据:');
    console.log(JSON.stringify(depth, null, 2));

    console.log('\n📊 解析结果:');
    console.log('bids类型:', typeof depth.bids, Array.isArray(depth.bids) ? '(数组)' : '(对象)');
    console.log('asks类型:', typeof depth.asks, Array.isArray(depth.asks) ? '(数组)' : '(对象)');

    if (depth.bids) {
      console.log('\nbids内容:');
      if (Array.isArray(depth.bids)) {
        console.log('  第一档:', depth.bids[0]);
      } else {
        console.log('  对象keys:', Object.keys(depth.bids));
      }
    }

    if (depth.asks) {
      console.log('\nasks内容:');
      if (Array.isArray(depth.asks)) {
        console.log('  第一档:', depth.asks[0]);
      } else {
        console.log('  对象keys:', Object.keys(depth.asks));
      }
    }
  });

  // 保持运行30秒
  await new Promise(resolve => setTimeout(resolve, 30000));
}

testDepth().catch(console.error);
