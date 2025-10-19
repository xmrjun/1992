#!/usr/bin/env node

/**
 * EdgeX ECDSA 认证测试
 * 测试修复后的 ECDSA 签名认证
 */

import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';

dotenv.config({ path: '.env.edgex' });

console.log('🧪 EdgeX ECDSA 认证测试');
console.log('========================\n');

async function testAuth() {
  try {
    // 初始化 EdgeX API（使用新的配置格式）
    const edgex = new EdgexAPI({
      starkPrivateKey: process.env.EDGEX_STARK_PRIVATE_KEY!,
      accountId: process.env.EDGEX_ACCOUNT_ID!
    });

    console.log('📋 配置信息:');
    console.log(`   Stark私钥前缀: ${process.env.EDGEX_STARK_PRIVATE_KEY?.substring(0, 16)}...`);
    console.log(`   账户ID: ${process.env.EDGEX_ACCOUNT_ID}`);
    console.log(`   认证方式: StarkEx ECDSA\n`);

    // 测试1: 获取余额
    console.log('📊 测试 1: 获取账户余额');
    console.log('─────────────────────────');
    const balance = await edgex.fetchBalance();

    if (Object.keys(balance).length > 0) {
      console.log('✅ 获取余额成功:');
      Object.entries(balance).forEach(([currency, info]: [string, any]) => {
        console.log(`   ${currency}: ${info.free} (可用) / ${info.total} (总计)`);
      });
    } else {
      console.log('⚠️ 余额为空或获取失败');
    }

    // 测试2: 获取价格
    console.log('\n📊 测试 2: 获取BTC价格');
    console.log('─────────────────────────');
    const ticker = await edgex.fetchTicker();
    console.log(`✅ BTC价格: ${ticker.price.toFixed(2)} USD`);
    console.log(`   买一: ${ticker.bid.toFixed(2)}`);
    console.log(`   卖一: ${ticker.ask.toFixed(2)}`);

    // 测试3: 获取持仓
    console.log('\n📊 测试 3: 获取持仓信息');
    console.log('─────────────────────────');
    const positions = await edgex.fetchPositions();
    console.log(`✅ 持仓数量: ${positions.length}`);
    if (positions.length > 0) {
      positions.forEach((pos: any) => {
        console.log(`   ${pos.symbol}: ${pos.side} ${pos.contracts} @ ${pos.entryPrice}`);
      });
    } else {
      console.log('   无持仓');
    }

    // 测试4: 获取成交记录
    console.log('\n📊 测试 4: 获取成交记录');
    console.log('─────────────────────────');
    const trades = await edgex.fetchMyTrades('BTC-USD-PERP', 5);
    console.log(`✅ 成交记录: ${trades.length} 笔`);
    if (trades.length > 0) {
      trades.forEach((trade: any, i: number) => {
        console.log(`   [${i + 1}] ${trade.side} ${trade.amount} @ ${trade.price}`);
      });
    } else {
      console.log('   无成交记录');
    }

    console.log('\n🎉 所有测试完成！');
    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response?.data) {
      console.error('服务器响应:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testAuth();
