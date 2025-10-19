#!/usr/bin/env node

/**
 * 安全的平仓逻辑测试脚本
 *
 * 目的：验证平仓参数的正确性，不执行实际交易
 * 分析用户仓位从 0.01 BTC 增加到 0.030 BTC 的问题
 */

import dotenv from 'dotenv';
dotenv.config();

// 模拟当前用户情况
const MOCK_USER_SITUATION = {
  initialPosition: 0.01,  // 初始多头仓位
  currentPosition: 0.030, // 当前多头仓位
  positionSide: 'LONG',   // 多头仓位

  // 模拟系统记录的仓位信息
  recordedPositions: [
    {
      asterSide: 'BUY',      // AsterDx 买入 (开多)
      backpackSide: 'sell',  // Backpack 卖出 (开空，对冲)
      amount: 0.01,
      timestamp: Date.now() - 3600000, // 1小时前
    }
  ]
};

/**
 * 测试平仓逻辑的正确性
 */
function testClosingLogic() {
  console.log('🔍 平仓逻辑测试');
  console.log('=================\n');

  console.log('📊 当前情况:');
  console.log(`   初始仓位: ${MOCK_USER_SITUATION.initialPosition} BTC (多头)`);
  console.log(`   当前仓位: ${MOCK_USER_SITUATION.currentPosition} BTC (多头)`);
  console.log(`   仓位变化: +${MOCK_USER_SITUATION.currentPosition - MOCK_USER_SITUATION.initialPosition} BTC`);
  console.log(`   问题: 每次"平仓"都在增加多头仓位！\n`);

  // 分析每个记录的仓位应该如何平仓
  MOCK_USER_SITUATION.recordedPositions.forEach((position, index) => {
    console.log(`📋 仓位 ${index + 1} 平仓分析:`);
    console.log(`   原开仓:`);
    console.log(`     AsterDx: ${position.asterSide} ${position.amount} BTC`);
    console.log(`     Backpack: ${position.backpackSide} ${position.amount} BTC`);

    // 计算平仓参数
    const asterCloseSide = position.asterSide === 'BUY' ? 'SELL' : 'BUY';
    const backpackCloseSide = position.backpackSide === 'sell' ? 'buy' : 'sell';

    console.log(`   计算的平仓:`);
    console.log(`     AsterDx: ${asterCloseSide} ${position.amount} BTC (reduceOnly=true)`);
    console.log(`     Backpack: ${backpackCloseSide} ${position.amount} BTC (reduceOnly=true)`);

    // 验证逻辑正确性
    console.log(`   逻辑验证:`);
    if (position.asterSide === 'BUY' && asterCloseSide === 'SELL') {
      console.log(`     ✅ AsterDx: 开多(BUY) → 平多(SELL) ✓`);
    } else {
      console.log(`     ❌ AsterDx: 逻辑错误！`);
    }

    if (position.backpackSide === 'sell' && backpackCloseSide === 'buy') {
      console.log(`     ✅ Backpack: 开空(sell) → 平空(buy) ✓`);
    } else {
      console.log(`     ❌ Backpack: 逻辑错误！`);
    }

    console.log('');
  });
}

/**
 * 分析可能的问题原因
 */
function analyzeProblems() {
  console.log('🔍 问题原因分析');
  console.log('=================\n');

  console.log('💡 可能的问题原因:');
  console.log('');

  console.log('1. ❌ 已修复: Backpack API调用错误');
  console.log('   - 之前使用了错误的 "Bid"/"Ask" 而不是 "buy"/"sell"');
  console.log('   - 现已修复为正确的 CCXT 格式');
  console.log('');

  console.log('2. ⚠️ 待验证: reduce_only 参数未生效');
  console.log('   - AsterDx API 可能不支持 reduce_only');
  console.log('   - 或者 reduce_only 参数格式错误');
  console.log('   - 需要查看实际 API 响应');
  console.log('');

  console.log('3. ⚠️ 待验证: 仓位记录错误');
  console.log('   - 系统记录的开仓方向可能错误');
  console.log('   - 导致平仓时使用错误的反向操作');
  console.log('');

  console.log('4. ⚠️ 待验证: API响应解析错误');
  console.log('   - API返回成功但实际执行失败');
  console.log('   - 错误处理逻辑有问题');
  console.log('');
}

/**
 * 提供解决方案
 */
function provideSolutions() {
  console.log('🎯 解决方案');
  console.log('=============\n');

  console.log('✅ 立即执行:');
  console.log('1. 停止机器人运行，避免继续增加仓位');
  console.log('2. 手动检查实际仓位状态');
  console.log('3. 使用小额测试验证平仓逻辑');
  console.log('');

  console.log('🔧 代码修复:');
  console.log('1. ✅ 已修复 Backpack API 调用错误 (Bid/Ask → buy/sell)');
  console.log('2. 添加更详细的错误日志和API响应检查');
  console.log('3. 验证 reduce_only 参数是否真正生效');
  console.log('4. 添加仓位状态实时验证');
  console.log('');

  console.log('🧪 测试建议:');
  console.log('1. 先开一个很小的测试仓位 (0.001 BTC)');
  console.log('2. 立即尝试平掉这个测试仓位');
  console.log('3. 验证平仓是否真正减少了仓位而不是增加');
  console.log('4. 检查API响应和实际仓位变化');
  console.log('');
}

/**
 * 生成安全的平仓命令
 */
function generateSafeCloseCommands() {
  console.log('⚡ 紧急平仓命令 (仅供参考)');
  console.log('===========================\n');

  const currentLongPosition = MOCK_USER_SITUATION.currentPosition;

  console.log('🚨 当前需要平掉的多头仓位:', currentLongPosition, 'BTC');
  console.log('');

  console.log('📋 理论上的平仓操作:');
  console.log(`   AsterDx: SELL ${currentLongPosition} BTC (reduceOnly=true)`);
  console.log(`   Backpack: buy ${currentLongPosition} BTC (reduceOnly=true)`);
  console.log('');

  console.log('⚠️ 重要提醒:');
  console.log('1. 不要直接执行上述命令！');
  console.log('2. 先用 0.001 BTC 测试验证');
  console.log('3. 确认测试成功后再处理剩余仓位');
  console.log('4. 每次操作后检查实际仓位变化');
  console.log('');
}

/**
 * 主函数
 */
function main() {
  console.log('🚀 仓位异常增加问题分析工具');
  console.log('============================\n');

  testClosingLogic();
  analyzeProblems();
  provideSolutions();
  generateSafeCloseCommands();

  console.log('✅ 分析完成');
  console.log('下一步: 请根据上述分析进行安全的小额测试');
}

main();