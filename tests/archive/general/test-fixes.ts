#!/usr/bin/env ts-node

/**
 * 测试EdgeX和Paradex修复后的认证功能
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import EdgexAPI from './edgex-api.js';
import { Paradex } from './exchanges/paradex.js';

// ES模块中获取__dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env.edgex') });
dotenv.config({ path: path.join(__dirname, '.env.paradex') });

async function testEdgeX() {
  console.log('\n🧪 测试EdgeX修复...');
  console.log('='.repeat(50));

  try {
    const edgex = new EdgexAPI({
      apiKey: process.env.EDGEX_API_KEY!,
      privateKey: process.env.EDGEX_PRIVATE_KEY!,
      publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y!
    });

    console.log('✅ EdgeX客户端创建成功');

    // 测试公开API
    console.log('\n📊 测试获取价格...');
    const ticker = await edgex.fetchTicker('BTC-USD-PERP');
    console.log(`价格: $${ticker.lastPrice}`);

    // 测试私有API - 获取余额
    console.log('\n💰 测试获取余额...');
    const balance = await edgex.fetchBalance();
    console.log('余额:', balance);

    // 测试下单（小额测试）
    console.log('\n📝 测试下单...');
    const order = await edgex.createOrder(
      'BTC-USD-PERP',
      'limit',
      'buy',
      0.001,  // 0.001 BTC
      50000   // $50,000 (远低于市价，不会成交)
    );
    console.log('订单结果:', order);

    return true;
  } catch (error: any) {
    console.error('❌ EdgeX测试失败:', error.message);
    if (error.response?.data) {
      console.error('响应详情:', error.response.data);
    }
    return false;
  }
}

async function testParadex() {
  console.log('\n🧪 测试Paradex修复...');
  console.log('='.repeat(50));

  try {
    const paradex = new Paradex({
      privateKey: process.env.PARADEX_PRIVATE_KEY!,
      walletAddress: process.env.PARADEX_WALLET_ADDRESS!,
      sandbox: process.env.PARADEX_SANDBOX === 'true'
    });

    console.log('✅ Paradex客户端创建成功');

    // 测试连接
    console.log('\n🔗 测试连接...');
    const isConnected = await paradex.testConnection();
    console.log(`连接状态: ${isConnected ? '成功' : '失败'}`);

    // 测试获取市场
    console.log('\n📊 测试获取市场...');
    const markets = await paradex.loadMarkets();
    const marketCount = Object.keys(markets).length;
    console.log(`可用市场数量: ${marketCount}`);

    // 测试获取价格
    console.log('\n💲 测试获取价格...');
    const btcSymbol = Object.keys(markets).find(s => s.includes('BTC')) || 'BTC/USD';
    const ticker = await paradex.fetchTicker(btcSymbol);
    console.log(`${btcSymbol} 价格: $${ticker.lastPrice}`);

    // 测试获取余额（需要私钥认证）
    console.log('\n💰 测试获取余额...');
    const balance = await paradex.fetchBalance();
    console.log('余额:', balance);

    return true;
  } catch (error: any) {
    console.error('❌ Paradex测试失败:', error.message);
    if (error.response?.data) {
      console.error('响应详情:', error.response.data);
    }
    return false;
  }
}

async function main() {
  console.log('🚀 开始测试交易所修复');
  console.log('时间:', new Date().toLocaleString());

  const results = {
    edgex: false,
    paradex: false
  };

  // 测试EdgeX
  results.edgex = await testEdgeX();

  // 测试Paradex
  results.paradex = await testParadex();

  // 汇总结果
  console.log('\n📋 测试结果汇总');
  console.log('='.repeat(50));
  console.log(`EdgeX:  ${results.edgex ? '✅ 通过' : '❌ 失败'}`);
  console.log(`Paradex: ${results.paradex ? '✅ 通过' : '❌ 失败'}`);

  const allPassed = results.edgex && results.paradex;
  console.log(`\n${allPassed ? '🎉 所有测试通过!' : '⚠️ 部分测试失败'}`);

  process.exit(allPassed ? 0 : 1);
}

// ES模块入口点检测
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}