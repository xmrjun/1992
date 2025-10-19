#!/usr/bin/env npx tsx
/**
 * 紧急平仓脚本 - 平掉所有当前持仓
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { TradeExecutor } = require('./TradeExecutor.js');

interface OrderResult {
  success: boolean;
  error?: string;
  fillData?: any;
}

async function closeAllPositions() {
  console.log('\n🚨 开始紧急平仓...\n');

  const executor = new (TradeExecutor as any)();
  await executor.initialize();

  // 等待初始化完成
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // 查询当前持仓
    console.log('📊 查询当前持仓...');

    const edgexPos = await queryEdgeXPosition(executor);
    const paradexPos = await queryParadexPosition(executor);

    console.log(`   EdgeX: ${edgexPos > 0 ? '+' : ''}${edgexPos} BTC`);
    console.log(`   Paradex: ${paradexPos > 0 ? '+' : ''}${paradexPos} BTC`);

    // 检查是否有持仓
    if (Math.abs(edgexPos) < 0.0001 && Math.abs(paradexPos) < 0.0001) {
      console.log('\n✅ 没有持仓需要平仓');
      await executor.close();
      return;
    }

    console.log('\n🔄 开始平仓...\n');

    // 平 EdgeX 持仓
    if (Math.abs(edgexPos) > 0.0001) {
      const edgexSide = edgexPos > 0 ? 'sell' : 'buy';
      const edgexAmount = Math.abs(edgexPos);

      console.log(`📤 EdgeX ${edgexSide.toUpperCase()} ${edgexAmount} BTC...`);
      const edgexResult: OrderResult = await executor.placeEdgeXOrder(edgexSide, edgexAmount);

      if (edgexResult.success) {
        console.log(`✅ EdgeX 平仓成功`);
      } else {
        console.error(`❌ EdgeX 平仓失败: ${edgexResult.error}`);
      }
    }

    // 平 Paradex 持仓
    if (Math.abs(paradexPos) > 0.0001) {
      const paradexSide = paradexPos > 0 ? 'sell' : 'buy';
      const paradexAmount = Math.abs(paradexPos);

      console.log(`📤 Paradex ${paradexSide.toUpperCase()} ${paradexAmount} BTC...`);
      const paradexResult: OrderResult = await executor.placeParadexOrder(paradexSide, paradexAmount);

      if (paradexResult.success) {
        console.log(`✅ Paradex 平仓成功`);
      } else {
        console.error(`❌ Paradex 平仓失败: ${paradexResult.error}`);
      }
    }

    // 再次查询确认
    console.log('\n📊 确认平仓结果...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const edgexPosAfter = await queryEdgeXPosition(executor);
    const paradexPosAfter = await queryParadexPosition(executor);

    console.log(`   EdgeX: ${edgexPosAfter > 0 ? '+' : ''}${edgexPosAfter} BTC`);
    console.log(`   Paradex: ${paradexPosAfter > 0 ? '+' : ''}${paradexPosAfter} BTC`);

    if (Math.abs(edgexPosAfter) < 0.0001 && Math.abs(paradexPosAfter) < 0.0001) {
      console.log('\n✅ 所有持仓已平仓完成\n');
    } else {
      console.warn('\n⚠️  仍有持仓未平完，请检查\n');
    }

  } catch (error: any) {
    console.error('❌ 平仓过程出错:', error.message);
  } finally {
    await executor.close();
  }
}

// 查询 EdgeX 持仓
function queryEdgeXPosition(executor: any): Promise<number> {
  return new Promise((resolve, reject) => {
    const id = `edgex_position_${Date.now()}`;
    const command = {
      id,
      action: 'get_position',
      params: { contract_id: '10000001' }
    };

    const timeout = setTimeout(() => {
      executor.commandCallbacks.delete(id);
      reject(new Error('EdgeX 持仓查询超时'));
    }, 10000);

    executor.commandCallbacks.set(id, (result: any) => {
      clearTimeout(timeout);
      if (result.success) {
        resolve(result.data.position || 0);
      } else {
        reject(new Error(result.error || 'EdgeX 持仓查询失败'));
      }
    });

    executor.edgexProcess.stdin.write(JSON.stringify(command) + '\n');
  });
}

// 查询 Paradex 持仓
function queryParadexPosition(executor: any): Promise<number> {
  return new Promise((resolve, reject) => {
    const id = `paradex_position_${Date.now()}`;
    const command = {
      id,
      action: 'get_position',
      params: { market: 'BTC-USD-PERP' }
    };

    const timeout = setTimeout(() => {
      executor.commandCallbacks.delete(id);
      reject(new Error('Paradex 持仓查询超时'));
    }, 10000);

    executor.commandCallbacks.set(id, (result: any) => {
      clearTimeout(timeout);
      if (result.success) {
        resolve(result.data.position || 0);
      } else {
        reject(new Error(result.error || 'Paradex 持仓查询失败'));
      }
    });

    executor.paradexProcess.stdin.write(JSON.stringify(command) + '\n');
  });
}

// 执行
closeAllPositions().catch(console.error);
