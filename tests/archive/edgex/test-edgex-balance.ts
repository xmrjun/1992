import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';

// 加载EdgeX环境变量
dotenv.config({ path: '/root/aster-bot/.env.edgex' });

console.log('🧪 EdgeX余额测试');

const edgex = new EdgexAPI({
  apiKey: process.env.EDGEX_API_KEY!,
  privateKey: process.env.EDGEX_PRIVATE_KEY!,
  publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y!
});

// 测试获取余额
async function testBalance() {
  try {
    console.log('🚀 测试EdgeX获取余额...');

    const balance = await edgex.fetchBalance();

    console.log('✅ EdgeX余额获取成功:', balance);
  } catch (error) {
    console.log('❌ EdgeX余额获取失败:', error.message);
    console.log('详细错误:', error.response?.data || error);
  }
}

testBalance();