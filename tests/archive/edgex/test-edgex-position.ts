#!/usr/bin/env node

import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';

dotenv.config({ path: '.env.edgex' });

console.log('🧪 EdgeX 查看持仓测试\n');

async function testPosition() {
  const edgex = new EdgexAPI({
    privateKey: process.env.EDGEX_PRIVATE_KEY!,
    accountId: process.env.EDGEX_ACCOUNT_ID!
  });

  console.log('📋 账户ID:', process.env.EDGEX_ACCOUNT_ID);
  console.log('🔑 私钥前缀:', process.env.EDGEX_PRIVATE_KEY?.substring(0, 16) + '...\n');

  try {
    console.log('📊 正在获取持仓...');
    const positions = await edgex.fetchPositions();

    console.log(`\n✅ 持仓数量: ${positions.length}\n`);

    if (positions.length > 0) {
      positions.forEach((pos: any, i: number) => {
        console.log(`[${i + 1}] ${pos.symbol}`);
        console.log(`    方向: ${pos.side}`);
        console.log(`    数量: ${pos.contracts}`);
        console.log(`    开仓价: ${pos.entryPrice}`);
        console.log(`    标记价: ${pos.markPrice}`);
        console.log(`    未实现盈亏: ${pos.unrealizedPnl}`);
        console.log(`    杠杆: ${pos.leverage}x`);
        console.log('');
      });
    } else {
      console.log('📭 当前无持仓');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ 获取持仓失败:', error.message);
    if (error.response?.data) {
      console.error('服务器响应:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testPosition();
