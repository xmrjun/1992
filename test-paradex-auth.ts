import Paradex from './exchanges/paradex.js';
import * as dotenv from 'dotenv';

// 加载Paradex配置
dotenv.config({ path: '.env.paradex' });

async function testParadex() {
  console.log('🧪 Paradex认证测试\n');
  console.log('📋 配置信息:');
  console.log(`   L1地址: ${process.env.PARADEX_L1_ADDRESS}`);
  console.log(`   L2私钥前缀: ${process.env.PARADEX_L2_PRIVATE_KEY?.substring(0, 16)}...`);
  console.log(`   API URL: ${process.env.PARADEX_API_URL}`);
  console.log();

  const paradex = new Paradex({
    privateKey: process.env.PARADEX_L2_PRIVATE_KEY!,
    walletAddress: process.env.PARADEX_L1_ADDRESS!,
    sandbox: false
  });

  // 测试1: 获取账户信息
  console.log('📊 测试 1: 获取账户信息');
  console.log('-'.repeat(50));
  try {
    const account = await paradex.fetchAccount();
    console.log('✅ 账户信息:');
    console.log(JSON.stringify(account, null, 2));
  } catch (error: any) {
    console.error('❌ 获取账户失败:', error.message);
  }
  console.log();

  // 测试2: 获取余额
  console.log('📊 测试 2: 获取余额');
  console.log('-'.repeat(50));
  try {
    const balance = await paradex.fetchBalance();
    console.log('✅ 余额信息:');
    console.log(JSON.stringify(balance, null, 2));
  } catch (error: any) {
    console.error('❌ 获取余额失败:', error.message);
  }
  console.log();

  // 测试3: 获取持仓
  console.log('📊 测试 3: 获取持仓');
  console.log('-'.repeat(50));
  try {
    const positions = await paradex.fetchPositions();
    console.log('✅ 持仓数量:', positions.length);
    if (positions.length > 0) {
      positions.forEach((pos: any) => {
        console.log(`   ${pos.symbol}: ${pos.contracts} 张 @ ${pos.entryPrice}`);
      });
    } else {
      console.log('   无持仓');
    }
  } catch (error: any) {
    console.error('❌ 获取持仓失败:', error.message);
  }
  console.log();

  // 测试4: 获取BTC价格
  console.log('📊 测试 4: 获取BTC价格');
  console.log('-'.repeat(50));
  try {
    const ticker = await paradex.fetchTicker('BTC-USD-PERP');
    console.log('✅ BTC价格:', ticker.last);
    console.log(`   买一: ${ticker.bid}`);
    console.log(`   卖一: ${ticker.ask}`);
  } catch (error: any) {
    console.error('❌ 获取价格失败:', error.message);
  }
  console.log();

  console.log('🎉 测试完成！');
}

testParadex().catch(console.error);
