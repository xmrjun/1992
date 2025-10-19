import crypto from 'crypto';
import axios from 'axios';
import * as starknet from '@scure/starknet';

console.log('🧪 EdgeX StarkEx ECDSA 认证测试 (修正版)');

const ACCOUNT_ID = '661402380167807119';
const STARK_PRIVATE_KEY = '007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2';

// 按照官方Java示例的K_MODULUS - 这是关键！
const K_MODULUS = BigInt('0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f');

async function testStarkExAuth() {
  const method = 'GET';
  const path = '/api/v1/private/account/getAccountAsset';
  const params = { accountId: ACCOUNT_ID };
  const timestamp = Date.now().toString();

  // 按照官方文档创建签名字符串: {timestamp}{METHOD}{path}{sorted_params}
  const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`);
  const queryString = sortedParams.join('&');
  const signMessage = `${timestamp}${method.toUpperCase()}${path}${queryString}`;

  console.log('签名字符串:', signMessage);

  try {
    // 步骤1: 将消息字符串转换为hex (TypeEncoder.encodePacked for Utf8String)
    const msgHex = Buffer.from(signMessage, 'utf-8').toString('hex');
    console.log('消息Hex:', msgHex);

    // 步骤2: 计算SHA3哈希
    const msgHashBytes = crypto.createHash('sha3-256').update(Buffer.from(msgHex, 'hex')).digest();
    const msgHashBigInt = BigInt('0x' + msgHashBytes.toString('hex'));
    console.log('SHA3哈希(BigInt):', msgHashBigInt.toString(16));

    // 步骤3: 对K_MODULUS取模 - 这是EdgeX的关键步骤！
    const msgHashMod = msgHashBigInt % K_MODULUS;
    const msgHash = msgHashMod.toString(16);
    console.log('取模后的哈希:', msgHash);

    // 步骤4: 使用StarkNet库进行ECDSA签名
    const signature = starknet.sign(msgHash, STARK_PRIVATE_KEY);
    console.log('StarkEx签名对象:', signature);

    // 步骤5: 将签名转换为hex格式 (r + s)
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

    console.log('✅ 认证成功!');
    console.log('响应数据:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.log('❌ 认证失败:', error.response?.data || error.message);
  }
}

testStarkExAuth();
