import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';

// 加载EdgeX环境变量
dotenv.config({ path: '/root/aster-bot/.env.edgex' });

console.log('🧪 EdgeX下单测试');

const edgex = new EdgexAPI({
  apiKey: process.env.EDGEX_API_KEY!,
  privateKey: process.env.EDGEX_PRIVATE_KEY!,
  publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y!
});

// 测试下单
async function testOrder() {
  try {
    console.log('🚀 测试EdgeX下单...');

    const order = await edgex.createMarketOrder(
      'BTC-USD-PERP',
      'buy',
      0.001,
      undefined,
      { reduceOnly: false }
    );

    console.log('✅ EdgeX下单成功:', order);
  } catch (error) {
    console.log('❌ EdgeX下单失败:', error.message);
  }
}

testOrder();