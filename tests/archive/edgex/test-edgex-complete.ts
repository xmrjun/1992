#!/usr/bin/env node

/**
 * EdgeX 完整功能测试
 * 包含：Public WebSocket (价格) + Private WebSocket (订单/持仓) + REST API
 * 按照官方文档实现
 */

import dotenv from 'dotenv';
import EdgexAPI from './edgex-api.js';

dotenv.config({ path: '.env.edgex' });

console.log('🧪 EdgeX 完整功能测试');
console.log('======================\n');

async function testEdgeXComplete() {
  const edgex = new EdgexAPI({
    apiKey: process.env.EDGEX_API_KEY!,
    privateKey: process.env.EDGEX_PRIVATE_KEY!,
    publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y!
  });

  try {
    // ============ 测试 1: REST API ============
    console.log('📡 测试 1: REST API');
    console.log('─────────────────────\n');

    // 获取余额
    console.log('💰 获取账户余额...');
    const balance = await edgex.fetchBalance();
    console.log('余额:', JSON.stringify(balance, null, 2));

    // 获取价格
    console.log('\n📊 获取BTC价格...');
    const ticker = await edgex.fetchTicker();
    console.log(`BTC价格: ${ticker.price.toFixed(2)} USD`);
    console.log(`买一: ${ticker.bid.toFixed(2)}, 卖一: ${ticker.ask.toFixed(2)}`);

    // 获取持仓
    console.log('\n📈 获取持仓信息...');
    const positions = await edgex.fetchPositions();
    console.log(`持仓数量: ${positions.length}`);
    if (positions.length > 0) {
      positions.forEach((pos: any) => {
        console.log(`  ${pos.symbol}: ${pos.side} ${pos.contracts} 合约 @ ${pos.entryPrice}`);
      });
    }

    // 获取成交记录
    console.log('\n📜 获取最近成交...');
    const trades = await edgex.fetchMyTrades('BTC-USD-PERP', 5);
    console.log(`成交记录: ${trades.length} 笔`);
    if (trades.length > 0) {
      trades.forEach((trade: any, i: number) => {
        console.log(`  [${i + 1}] ${trade.side} ${trade.amount} @ ${trade.price}`);
      });
    }

    console.log('\n✅ REST API测试完成\n');

    // ============ 测试 2: Public WebSocket (市场数据) ============
    console.log('📡 测试 2: Public WebSocket (市场数据)');
    console.log('────────────────────────────────────\n');

    let priceUpdateCount = 0;
    await edgex.connectWebSocket((price) => {
      priceUpdateCount++;
      console.log(`[${priceUpdateCount}] 💰 BTC实时价格: ${price.toFixed(2)} USD`);
    });

    console.log('✅ Public WebSocket已连接\n');

    // 等待30秒接收价格数据
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log(`\n📊 价格更新统计: 收到 ${priceUpdateCount} 次价格推送\n`);

    // ============ 测试 3: Private WebSocket (账户数据) ============
    console.log('📡 测试 3: Private WebSocket (账户数据)');
    console.log('─────────────────────────────────────\n');

    let orderUpdateCount = 0;
    let positionUpdateCount = 0;
    let accountUpdateCount = 0;

    await edgex.connectPrivateWebSocket({
      onOrder: (order) => {
        orderUpdateCount++;
        console.log(`📋 [${orderUpdateCount}] 订单更新:`, order);
      },
      onPosition: (position) => {
        positionUpdateCount++;
        console.log(`📊 [${positionUpdateCount}] 持仓更新:`, position);
      },
      onAccount: (account) => {
        accountUpdateCount++;
        console.log(`💰 [${accountUpdateCount}] 账户更新:`, account);
      }
    });

    console.log('✅ Private WebSocket已连接\n');
    console.log('💡 提示：Private WebSocket会自动推送账户数据（无需订阅）');
    console.log('💡 如果没有订单或持仓变化，可能不会收到推送\n');

    // 等待30秒接收账户数据
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log(`\n📊 账户数据统计:`);
    console.log(`   订单更新: ${orderUpdateCount} 次`);
    console.log(`   持仓更新: ${positionUpdateCount} 次`);
    console.log(`   账户更新: ${accountUpdateCount} 次\n`);

    // ============ 测试完成 ============
    console.log('🎉 所有测试完成！\n');
    console.log('📋 测试摘要:');
    console.log(`   ✅ REST API: 余额、价格、持仓、成交`);
    console.log(`   ✅ Public WebSocket: ${priceUpdateCount} 次价格更新`);
    console.log(`   ✅ Private WebSocket: ${orderUpdateCount + positionUpdateCount + accountUpdateCount} 次账户数据更新`);

    // 关闭连接
    await edgex.closeWebSocket();
    await edgex.closePrivateWebSocket();

    console.log('\n👋 连接已关闭');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

// 信号处理
process.on('SIGINT', async () => {
  console.log('\n\n🛑 收到停止信号');
  process.exit(0);
});

// 运行测试
testEdgeXComplete();
