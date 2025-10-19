#!/usr/bin/env tsx

/**
 * 测试 EdgeX 下单功能
 */

import EdgexAPI from './edgex-api';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.edgex' });

async function testEdgeXOrder() {
  console.log('🔧 初始化 EdgeX API...');

  const edgex = new EdgexAPI({
    accountId: process.env.EDGEX_ACCOUNT_ID!,
    starkPrivateKey: process.env.EDGEX_STARK_PRIVATE_KEY!,
    baseUrl: process.env.EDGEX_BASE_URL || 'https://pro.edgex.exchange',
  });

  try {
    console.log('\n✅ EdgeX API 初始化成功');
    console.log(`   账户ID: ${process.env.EDGEX_ACCOUNT_ID}`);

    // 测试下单（买入 0.001 BTC）
    console.log('\n📝 测试下单: 买入 0.001 BTC (市价单)');

    const order = await edgex.createMarketOrder('BTC-USD-PERP', 'buy', 0.001);

    console.log('✅ 订单创建成功:');
    console.log(`   订单ID: ${order.id}`);
    console.log(`   完整响应:`, JSON.stringify(order, null, 2));

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   响应数据:', error.response);
    }
    process.exit(1);
  }
}

testEdgeXOrder();
