#!/usr/bin/env node

/**
 * EdgeX REST API测试
 * 先确保基本连接可用
 */

import axios from 'axios';

console.log('🧪 EdgeX REST API测试');
console.log('====================\n');

async function testEdgexRest() {
  const baseURL = 'https://pro.edgex.exchange';

  // 测试公开API端点
  const endpoints = [
    '/api/v1/public/market/getTicker?symbol=BTC-USD-PERP',
    '/api/v1/public/ticker',
    '/api/v1/public/market/ticker',
    '/api/v1/market/ticker',
    '/api/v1/ticker',
    '/public/ticker',
    '/ticker'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`🔍 测试: ${baseURL}${endpoint}`);
      const response = await axios.get(`${baseURL}${endpoint}`, {
        timeout: 5000,
        headers: {
          'User-Agent': 'EdgeX-Client/1.0'
        }
      });

      console.log(`✅ 成功! 状态: ${response.status}`);
      console.log('📊 响应数据:', JSON.stringify(response.data, null, 2));
      console.log('=' .repeat(50));

      // 如果成功，继续测试其他端点以了解API结构

    } catch (error: any) {
      if (error.response) {
        console.log(`❌ HTTP错误: ${error.response.status} - ${error.response.statusText}`);
        if (error.response.data) {
          console.log('📋 错误数据:', JSON.stringify(error.response.data, null, 2));
        }
      } else {
        console.log(`❌ 网络错误: ${error.message}`);
      }
      console.log('=' .repeat(50));
    }
  }

  // 测试WebSocket信息端点
  console.log('\n🔍 尝试获取WebSocket连接信息...');
  const wsInfoEndpoints = [
    '/api/v1/public/ws-info',
    '/api/v1/ws/info',
    '/ws/info',
    '/api/v1/public/websocket',
    '/websocket/info'
  ];

  for (const endpoint of wsInfoEndpoints) {
    try {
      console.log(`🔍 测试WS信息: ${baseURL}${endpoint}`);
      const response = await axios.get(`${baseURL}${endpoint}`, {
        timeout: 5000
      });

      console.log(`✅ WebSocket信息成功! 状态: ${response.status}`);
      console.log('📊 WebSocket信息:', JSON.stringify(response.data, null, 2));

    } catch (error: any) {
      console.log(`❌ WebSocket信息错误: ${error.response?.status || error.message}`);
    }
  }
}

testEdgexRest().catch(error => {
  console.error('❌ 测试失败:', error.message);
  process.exit(1);
});