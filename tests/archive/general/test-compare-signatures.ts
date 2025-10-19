import crypto from 'crypto';

console.log('🧪 签名对比测试');

const api_key = '661402380167807119';
const api_secret = '007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2';
const public_key = '043453513f0c1ac9c13e50f363fac99bb2816faaabc92a82329a6e096f96324d';
const account_id = '661402380167807119';

// 使用固定时间戳
const timestamp = '1759500000000';
const path = '/api/v1/private/account/getAccountAsset';

// 创建签名 - 完全按照Python
const params = { accountId: account_id };
const query_string = Object.entries(params)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v}`)
  .join('&');

const sign_message = `${timestamp}GET${path}?${query_string}`;

console.log('签名字符串:', sign_message);
console.log('API Secret:', api_secret);

// HMAC SHA3-256
const signature = crypto
  .createHmac('sha3-256', api_secret)
  .update(sign_message, 'utf-8')
  .digest('hex');

console.log('TypeScript签名:', signature);

// 验证HMAC是否支持sha3-256
const algorithms = crypto.getHashes();
console.log('支持sha3-256:', algorithms.includes('sha3-256'));

// 测试各种HMAC算法
console.log('\n测试不同HMAC算法:');
console.log('HMAC-SHA256:', crypto.createHmac('sha256', api_secret).update(sign_message, 'utf-8').digest('hex'));
console.log('HMAC-SHA3-256:', crypto.createHmac('sha3-256', api_secret).update(sign_message, 'utf-8').digest('hex'));
console.log('HMAC-SHA512:', crypto.createHmac('sha512', api_secret).update(sign_message, 'utf-8').digest('hex'));