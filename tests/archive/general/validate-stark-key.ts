#!/usr/bin/env node

/**
 * 验证 StarkEx 私钥的有效性
 */

import * as starknet from '@scure/starknet';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.edgex' });

console.log('🔐 StarkEx 私钥验证');
console.log('===================\n');

function validateStarkKey(privateKey: string): boolean {
  try {
    console.log(`📋 私钥: ${privateKey}`);
    console.log(`   长度: ${privateKey.length} 字符\n`);

    // 1. 检查格式
    if (!/^[0-9a-f]{64}$/i.test(privateKey)) {
      console.error('❌ 私钥格式错误：必须是 64 位十六进制（无0x前缀）');
      return false;
    }
    console.log('✅ 格式检查：通过（64位hex）');

    // 2. 检查范围（必须小于 StarkEx 曲线阶数）
    const privKeyBigInt = BigInt('0x' + privateKey);
    const K_MODULUS = BigInt('0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f');

    console.log(`\n📊 数值范围检查:`);
    console.log(`   私钥值: ${privKeyBigInt.toString(16)}`);
    console.log(`   K_MODULUS: ${K_MODULUS.toString(16)}`);

    if (privKeyBigInt >= K_MODULUS) {
      console.error('❌ 私钥超出 StarkEx 曲线范围');
      return false;
    }
    if (privKeyBigInt === 0n) {
      console.error('❌ 私钥不能为0');
      return false;
    }
    console.log('✅ 范围检查：通过');

    // 3. 尝试生成公钥
    console.log('\n🔑 生成公钥...');
    const publicKey = starknet.getPublicKey(privateKey);
    console.log(`✅ 公钥生成成功:`);
    console.log(`   ${publicKey}`);

    // 4. 测试签名和验证
    console.log('\n📝 测试签名功能...');
    const testMessage = 'edgex-test-message';
    const msgHash = BigInt('0x' + Buffer.from(testMessage, 'utf-8').toString('hex'));
    const msgHashMod = (msgHash % K_MODULUS).toString(16).padStart(64, '0');

    const signature = starknet.sign(msgHashMod, privateKey);
    console.log(`   消息: ${testMessage}`);
    console.log(`   哈希: ${msgHashMod.substring(0, 32)}...`);
    console.log(`   签名 r: ${signature.r.toString(16).substring(0, 32)}...`);
    console.log(`   签名 s: ${signature.s.toString(16).substring(0, 32)}...`);

    const isValid = starknet.verify(signature, msgHashMod, publicKey);
    console.log(`✅ 签名验证: ${isValid ? '成功 ✓' : '失败 ✗'}`);

    if (!isValid) {
      console.error('❌ 签名验证失败 - 私钥可能损坏');
      return false;
    }

    console.log('\n🎉 StarkEx 私钥完全有效！');
    return true;

  } catch (error: any) {
    console.error('\n❌ 私钥验证失败:', error.message);
    console.error('   Stack:', error.stack);
    return false;
  }
}

// 测试环境变量中的私钥
const privateKey = process.env.EDGEX_PRIVATE_KEY;

if (!privateKey) {
  console.error('❌ EDGEX_PRIVATE_KEY 未设置');
  console.log('请在 .env.edgex 文件中设置 EDGEX_PRIVATE_KEY');
  process.exit(1);
}

const isValid = validateStarkKey(privateKey);

if (isValid) {
  console.log('\n✅ 私钥验证通过！可以用于 EdgeX API 认证');
  console.log('\n💡 如果仍然出现 INVALID_SIGNATURE 错误，可能的原因：');
  console.log('   1. 私钥与 Account ID 不匹配');
  console.log('   2. EdgeX 后端没有注册此公钥');
  console.log('   3. 需要在 EdgeX 平台重新生成 API Key');
} else {
  console.log('\n❌ 私钥验证失败！');
  console.log('\n💡 解决方案：');
  console.log('   1. 登录 EdgeX 平台 (https://pro.edgex.exchange)');
  console.log('   2. 前往 API 设置页面');
  console.log('   3. 生成新的 API Key');
  console.log('   4. 更新 .env.edgex 文件');
}

process.exit(isValid ? 0 : 1);
