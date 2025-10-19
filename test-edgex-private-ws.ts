import EdgexAPI from './edgex-api.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.edgex' });

async function testPrivateWS() {
  const api = new EdgexAPI({
    starkPrivateKey: process.env.EDGEX_STARK_PRIVATE_KEY!,
    accountId: process.env.EDGEX_ACCOUNT_ID
  });

  console.log('🧪 测试EdgeX Private WebSocket\n');
  console.log(`账户ID: ${process.env.EDGEX_ACCOUNT_ID}`);
  console.log(`私钥前缀: ${process.env.EDGEX_STARK_PRIVATE_KEY?.substring(0, 16)}...\n`);

  // 连接Private WebSocket
  await api.connectPrivateWebSocket({
    onOrder: (order) => {
      console.log('\n📋 订单更新:');
      console.log(JSON.stringify(order, null, 2));
    },
    onPosition: (positions) => {
      console.log('\n📊 持仓更新:');
      console.log(JSON.stringify(positions, null, 2));
    },
    onAccount: (account) => {
      console.log('\n💰 账户更新:');
      console.log(JSON.stringify(account, null, 2));
    }
  });

  console.log('\n✅ Private WebSocket已连接，等待推送...\n');

  // 保持运行2分钟
  await new Promise(resolve => setTimeout(resolve, 120000));
}

testPrivateWS().catch(console.error);
