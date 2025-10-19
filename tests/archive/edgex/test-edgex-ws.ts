#!/usr/bin/env node

/**
 * EdgeX WebSocket价格获取测试
 */

import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';

// 加载EdgeX专用环境变量
dotenv.config({ path: '.env.edgex' });

async function testEdgexWebSocket() {
  console.log('🧪 EdgeX WebSocket价格获取测试');
  console.log('================================\n');

  // 初始化EdgeX API
  const edgexAPI = new EdgexAPI({
    apiKey: process.env.EDGEX_API_KEY!,
    privateKey: process.env.EDGEX_PRIVATE_KEY!,
    publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y!
  });

  try {
    // 1. 跳过REST API测试，直接测试WebSocket
    console.log('⏭️ 跳过REST API，直接测试WebSocket...');

    // 2. 测试WebSocket连接
    console.log('🔌 启动WebSocket连接...');

    let priceUpdateCount = 0;
    const maxUpdates = 10; // 最多接收10次价格更新

    await edgexAPI.connectWebSocket((price) => {
      priceUpdateCount++;
      console.log(`📊 [${priceUpdateCount}] WebSocket价格更新: ${price.toFixed(2)} USD`);

      // 接收足够的更新后停止测试
      if (priceUpdateCount >= maxUpdates) {
        console.log(`\n✅ 已接收${maxUpdates}次价格更新，测试完成！`);
        process.exit(0);
      }
    });

    // 等待WebSocket连接和数据
    console.log('⏳ 等待WebSocket价格数据...\n');

    // 10秒后如果没有收到数据就退出
    setTimeout(() => {
      console.log('\n⏰ 10秒测试时间结束');
      if (priceUpdateCount === 0) {
        console.log('❌ 未收到任何WebSocket价格数据');
      } else {
        console.log(`✅ 共收到${priceUpdateCount}次价格更新`);
      }
      process.exit(0);
    }, 10000);

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
testEdgexWebSocket().catch(error => {
  console.error('❌ 程序执行失败:', error);
  process.exit(1);
});