#!/usr/bin/env node

/**
 * 测试修复后的EdgeX WebSocket
 */

import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';

// 加载EdgeX专用环境变量
dotenv.config({ path: '.env.edgex' });

async function testFixedEdgexWebSocket() {
  console.log('🔧 测试修复后的EdgeX WebSocket');
  console.log('================================\n');

  // 初始化EdgeX API
  const edgexAPI = new EdgexAPI({
    apiKey: process.env.EDGEX_API_KEY!,
    privateKey: process.env.EDGEX_PRIVATE_KEY!,
    publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y!
  });

  try {
    console.log('🔌 启动修复后的WebSocket连接...');

    let priceUpdateCount = 0;
    const maxUpdates = 5; // 最多接收5次价格更新

    await edgexAPI.connectWebSocket((price) => {
      priceUpdateCount++;
      console.log(`💰 [${priceUpdateCount}] EdgeX价格更新: ${price.toFixed(2)} USD`);

      // 接收足够的更新后停止测试
      if (priceUpdateCount >= maxUpdates) {
        console.log(`\n✅ 已接收${maxUpdates}次价格更新，修复成功！`);
        process.exit(0);
      }
    });

    // 等待30秒接收数据
    console.log('⏳ 等待EdgeX WebSocket数据（30秒）...\n');

    setTimeout(() => {
      console.log('\n⏰ 30秒测试时间结束');
      if (priceUpdateCount === 0) {
        console.log('ℹ️ 未收到价格更新，但可能收到了其他消息');
        console.log('📊 检查上面的日志查看EdgeX发送的消息格式');
      } else {
        console.log(`✅ 修复成功！共收到${priceUpdateCount}次价格更新`);
      }
      process.exit(0);
    }, 30000);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 信号处理
process.on('SIGINT', async () => {
  console.log('\n🛑 测试中断，正在清理...');
  process.exit(0);
});

// 运行测试
testFixedEdgexWebSocket().catch(error => {
  console.error('❌ 程序执行失败:', error);
  process.exit(1);
});