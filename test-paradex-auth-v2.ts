#!/usr/bin/env node

/**
 * 测试 Paradex API 认证（使用官方 StarkNet TypedData 签名）
 */

import { ec } from 'starknet';
import ParadexAPIClientV2 from './paradex-api-client-v2.js';

async function testParadexAuth() {
  console.log('🧪 测试 Paradex API 认证（V2 - StarkNet TypedData）\n');

  // 完整的账户信息（使用 Python SDK 派生的正确地址）
  const ethereumAccount = '0x123aAa7Afb675b76c37A2d36CE5eE6179f892d76';  // L1地址
  const paradexAddress = '0x58bdd5da09b79e9492c692bbb1f8d71c5681917f93b524a9103ce64e976ae07';  // L2账户地址（Python SDK派生）
  const privateKey = '0x57abc834fead9a4984a557b9cff8d576bf87765f8ec2181d79a7f15e70e46f2';  // L2私钥

  // 从私钥派生公钥
  const publicKey = ec.starkCurve.getStarkKey(privateKey);

  console.log('账户信息:');
  console.log(`  Ethereum地址: ${ethereumAccount}`);
  console.log(`  Paradex地址:  ${paradexAddress}`);
  console.log(`  公钥:         ${publicKey}`);
  console.log(`  私钥:         ${privateKey.slice(0, 10)}...`);

  // 创建 API 客户端
  const client = new ParadexAPIClientV2({
    accountInfo: {
      address: paradexAddress,           // 使用 Paradex 提供的账户地址
      publicKey: publicKey,              // 从私钥派生
      privateKey: privateKey,
      ethereumAccount: ethereumAccount,
    },
    testnet: true
  });

  try {
    // 跳过 Onboarding（账户已经 onboarded）
    // console.log('\n🔐 步骤1: Onboarding...');
    // await client.onboard();

    console.log('\n🔑 步骤1: 认证...');
    await client.authenticate();

    console.log('\n📊 步骤3: 获取账户信息...');
    const account = await client.getAccount();
    console.log('账户信息:', JSON.stringify(account, null, 2));

    console.log('\n✅ 所有测试通过！');
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

testParadexAuth();
