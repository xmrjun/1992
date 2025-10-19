import crypto from 'crypto';
import axios from 'axios';
import elliptic from 'elliptic';

console.log('🧪 EdgeX正确ECDSA-SHA3认证测试');

const API_KEY = '661402380167807119';
const L2_PRIVATE_KEY = '007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2';

async function testCorrectECDSAAuth() {
  const method = 'GET';
  const path = '/api/v1/private/account/getAccountAsset';
  const params = { accountId: API_KEY };
  const timestamp = Date.now().toString();

  // 按照官方文档创建签名字符串: {timestamp}{METHOD}{path}{sorted_params}
  // 对于GET请求，参数应该包含在路径中作为查询字符串
  const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`);
  const queryString = sortedParams.join('&');
  const signMessage = `${timestamp}${method.toUpperCase()}${path}?${queryString}`;

  console.log('签名字符串:', signMessage);

  // 使用ECDSA-SHA3签名 - 按照官方文档
  const EC = elliptic.ec;
  const ec = new EC('secp256k1');
  const keyPair = ec.keyFromPrivate(L2_PRIVATE_KEY, 'hex');

  // SHA3哈希 - 关键点！
  const msgHash = crypto.createHash('sha3-256').update(signMessage, 'utf-8').digest();
  const signature = keyPair.sign(msgHash);

  // 获取r和s值并转换为十六进制，确保长度为64字符
  const r = signature.r.toString('hex').padStart(64, '0');
  const s = signature.s.toString('hex').padStart(64, '0');

  // EdgeX使用r+s格式，不需要v值
  const finalSignature = `${r}${s}`;

  console.log('ECDSA-SHA3签名:', finalSignature);

  // 按照官方文档的头格式 - 只需要这两个头
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

testCorrectECDSAAuth();