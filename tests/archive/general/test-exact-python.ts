import crypto from 'crypto';
import axios from 'axios';

console.log('🧪 完全按照Python实现');

const api_key = '661402380167807119';
const api_secret = '007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2';
const public_key = '043453513f0c1ac9c13e50f363fac99bb2816faaabc92a82329a6e096f96324d';
const account_id = '661402380167807119';
const base_url = 'https://pro.edgex.exchange';

async function testExactPython() {
  const path = '/api/v1/private/account/getAccountAsset';
  const timestamp = Date.now().toString();

  // 创建签名 - 完全按照Python
  const params = { accountId: account_id };
  const query_string = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const sign_message = `${timestamp}GET${path}?${query_string}`;

  console.log('签名字符串:', sign_message);

  // HMAC SHA3-256 - 完全按照Python
  const signature = crypto
    .createHmac('sha3-256', api_secret)
    .update(sign_message, 'utf-8')
    .digest('hex');

  console.log('签名:', signature);

  // 请求头 - 完全按照Python
  const headers = {
    'X-edgeX-Api-Key': api_key,
    'X-edgeX-Timestamp': timestamp,
    'X-edgeX-Signature': signature,
    'X-edgeX-Passphrase': public_key,
    'Content-Type': 'application/json'
  };

  console.log('请求头:', headers);

  const url = `${base_url}${path}`;
  console.log('请求URL:', url);
  console.log('请求参数:', params);

  try {
    const response = await axios.get(url, { params, headers, timeout: 10 });
    console.log('状态码:', response.status);
    console.log('✅ 响应:', response.data);
  } catch (error) {
    console.log('状态码:', error.response?.status);
    console.log('❌ 响应:', error.response?.data || error.message);
    console.log('错误详情:', error.code);
  }
}

testExactPython();