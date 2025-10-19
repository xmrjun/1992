#!/usr/bin/env node

import dotenv from 'dotenv';
import LighterReal from './exchanges/lighter-real.js';

// 加载Lighter专用环境变量
dotenv.config({ path: '.env.lighter' });

async function testArbitrageShort() {
    console.log('🎯 测试套利机器人的开空逻辑');
    console.log('=' * 40);

    const lighterAPI = new LighterReal({
        testnet: false,
        marketId: 1
    });

    try {
        console.log('🔴 Lighter开空: 0.01 BTC');

        // 直接调用套利机器人中成功的方法
        const result = await lighterAPI.openShort(0.01);

        console.log('✅ 结果:', result);
        console.log('📊 状态:', result.status);
        console.log('💳 交易ID:', result.id);
        console.log('💰 金额:', result.amount);
        console.log('📈 方向:', result.side);

        if (result.status === 'success') {
            console.log('🎉 开空成功!');
            console.log('📋 交易哈希:', result.txHash);
        } else {
            console.log('❌ 开空失败');
        }

        await lighterAPI.close();

    } catch (error: any) {
        console.error('❌ 错误:', error.message);
    }
}

testArbitrageShort().catch(console.error);