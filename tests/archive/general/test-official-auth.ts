import crypto from 'crypto';
import axios from 'axios';
import elliptic from 'elliptic';

console.log('🧪 EdgeX官方ECDSA-SHA3认证测试');

const ACCOUNT_ID = '661402380167807119';
const PRIVATE_KEY = '007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2';

async function testOfficialAuth() {
  const method = 'GET';
  const path = '/api/v1/private/account/getAccountAsset';
  const params = { accountId: ACCOUNT_ID };
  const timestamp = Date.now().toString();

  // 按照官方文档格式: {timestamp}{METHOD}{path}{sorted_params}
  const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`);
  const queryString = sortedParams.join('&');
  const signMessage = `${timestamp}${method.toUpperCase()}${path}?${queryString}`;

  console.log('签名字符串:', signMessage);

  // 使用ECDSA + SHA3 (官方文档说明)
  const EC = elliptic.ec;
  const ec = new EC('secp256k1');
  const keyPair = ec.keyFromPrivate(PRIVATE_KEY, 'hex');

  // SHA3-256哈希
  const msgHash = crypto.createHash('sha3-256').update(signMessage, 'utf-8').digest();

  // ECDSA签名
  const signature = keyPair.sign(msgHash, 'hex');

  // 签名格式：r + s (64+64=128字符)
  const r = signature.r.toString('hex').padStart(64, '0');
  const s = signature.s.toString('hex').padStart(64, '0');
  const finalSignature = r + s;

  console.log('ECDSA签名:', finalSignature);

  // 官方格式：只需要两个头
  const headers = {
    'X-edgeX-Api-Timestamp': timestamp,
    'X-edgeX-Api-Signature': finalSignature
  };

  console.log('请求头:', headers);

  try {
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

testOfficialAuth();