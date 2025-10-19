import crypto from 'crypto';
import axios from 'axios';
import * as starknet from '@scure/starknet';

console.log('🧪 EdgeX StarkEx认证测试');

const ACCOUNT_ID = '661402380167807119';
const STARK_PRIVATE_KEY = '007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2';

async function testStarkExAuth() {
  const method = 'GET';
  const path = '/api/v1/private/account/getAccountAsset';
  const params = { accountId: ACCOUNT_ID };
  const timestamp = Date.now().toString();

  // 按照官方文档创建签名字符串: {timestamp}{METHOD}{path}{sorted_params}
  const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`);
  const queryString = sortedParams.join('&');
  const signMessage = `${timestamp}${method.toUpperCase()}${path}?${queryString}`;

  console.log('签名字符串:', signMessage);

  try {
    // 使用StarkNet签名 - 关键点！
    // 首先计算消息的SHA3哈希
    const msgHashHex = crypto.createHash('sha3-256').update(signMessage, 'utf-8').digest('hex');
    console.log('消息哈希(hex):', msgHashHex);

    // 将哈希转换为BigInt并确保在StarkNet范围内
    const msgHashBigInt = BigInt('0x' + msgHashHex);
    const STARK_FIELD_PRIME = BigInt('0x0800000000000011000000000000000000000000000000000000000000000001');
    const msgHashMod = msgHashBigInt % STARK_FIELD_PRIME;
    const msgHash = msgHashMod.toString(16);

    console.log('消息哈希(用于签名):', msgHash);

    // 使用StarkNet库进行签名
    const signature = starknet.sign(msgHash, STARK_PRIVATE_KEY);
    console.log('StarkEx签名对象:', signature);

    // 将签名转换为hex格式
    const r = signature.r.toString(16).padStart(64, '0');
    const s = signature.s.toString(16).padStart(64, '0');
    const finalSignature = `${r}${s}`;

    console.log('最终签名:', finalSignature);

    // 按照官方文档的头格式
    const headers = {
      'X-edgeX-Api-Timestamp': timestamp,
      'X-edgeX-Api-Signature': finalSignature
    };

    console.log('请求头:', headers);

    const response = await axios.get('https://pro.edgex.exchange' + path, {
      params,
      headers,
      timeout: 10000
    });

    console.log('✅ 成功:', response.data);
  } catch (error) {
    console.log('❌ 失败:', error.response?.data || error.message);
  }
}

testStarkExAuth();