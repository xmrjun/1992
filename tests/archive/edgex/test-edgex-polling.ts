#!/usr/bin/env node

/**
 * EdgeX轮询价格测试 - WebSocket替代方案
 * 用于套利交易的价格获取
 */

import axios from 'axios';

console.log('🧪 EdgeX轮询价格测试');
console.log('WebSocket替代方案');
console.log('====================\n');

class EdgexPollingPriceFeed {
  private lastPrice: number = 0;
  private priceCallback?: (price: number) => void;
  private pollingInterval?: NodeJS.Timeout;
  private updateCount: number = 0;

  // 尝试多个可能的价格API端点
  private priceEndpoints = [
    'https://pro.edgex.exchange/api/v1/public/ticker',
    'https://pro.edgex.exchange/api/v1/market/ticker',
    'https://pro.edgex.exchange/api/v1/ticker',
    'https://pro.edgex.exchange/api/public/ticker',
    'https://pro.edgex.exchange/ticker',
    'https://api.edgex.exchange/v1/ticker',
    'https://api.edgex.exchange/ticker',
    // 基于发现的API基础URL
    'https://be-portal.edgex.exchange/api/v1/public/ticker',
    'https://be-portal.edgex.exchange/api/public/ticker'
  ];

  async findWorkingEndpoint(): Promise<string | null> {
    console.log('🔍 搜索可用的价格API端点...\n');

    for (const endpoint of this.priceEndpoints) {
      try {
        console.log(`🔍 测试: ${endpoint}`);

        const response = await axios.get(endpoint, {
          timeout: 5000,
          headers: {
            'User-Agent': 'EdgeX-Arbitrage-Bot/1.0'
          }
        });

        console.log(`✅ 响应状态: ${response.status}`);

        if (response.data && typeof response.data === 'object') {
          console.log('📊 响应数据:', JSON.stringify(response.data, null, 2));

          // 查找价格字段
          const price = this.extractPrice(response.data);
          if (price > 0) {
            console.log(`💰 发现价格: $${price}`);
            console.log(`✅ 找到可用端点: ${endpoint}\n`);
            return endpoint;
          }
        }

      } catch (error: any) {
        if (error.response) {
          console.log(`❌ HTTP错误: ${error.response.status}`);
        } else {
          console.log(`❌ 网络错误: ${error.message}`);
        }
      }
      console.log('-'.repeat(50));
    }

    return null;
  }

  private extractPrice(data: any): number {
    // 尝试多种可能的价格字段
    const priceFields = [
      'price', 'lastPrice', 'last', 'close', 'c', 'markPrice',
      'data.price', 'data.lastPrice', 'data.last', 'data.close',
      'result.price', 'result.lastPrice', 'ticker.price', 'ticker.lastPrice'
    ];

    for (const field of priceFields) {
      const value = this.getNestedProperty(data, field);
      if (value && !isNaN(parseFloat(value))) {
        return parseFloat(value);
      }
    }

    // 如果是数组，检查第一个元素
    if (Array.isArray(data) && data.length > 0) {
      return this.extractPrice(data[0]);
    }

    return 0;
  }

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  async startPolling(callback: (price: number) => void, intervalMs: number = 2000): Promise<boolean> {
    this.priceCallback = callback;

    // 首先找到可用的端点
    const workingEndpoint = await this.findWorkingEndpoint();

    if (!workingEndpoint) {
      console.log('❌ 未找到可用的EdgeX价格API端点');
      return false;
    }

    console.log(`🚀 开始轮询价格 (间隔: ${intervalMs}ms)`);
    console.log(`📡 使用端点: ${workingEndpoint}\n`);

    this.pollingInterval = setInterval(async () => {
      try {
        const response = await axios.get(workingEndpoint, {
          timeout: 3000,
          headers: {
            'User-Agent': 'EdgeX-Arbitrage-Bot/1.0'
          }
        });

        const price = this.extractPrice(response.data);

        if (price > 0 && price !== this.lastPrice) {
          this.lastPrice = price;
          this.updateCount++;

          console.log(`📊 [${this.updateCount}] EdgeX价格更新: $${price.toFixed(2)}`);

          if (this.priceCallback) {
            this.priceCallback(price);
          }
        }

      } catch (error: any) {
        console.log(`❌ 轮询错误: ${error.message}`);
      }
    }, intervalMs);

    return true;
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
      console.log('🛑 EdgeX价格轮询已停止');
    }
  }

  getLastPrice(): number {
    return this.lastPrice;
  }
}

// 测试轮询价格
async function testPollingFeed() {
  const priceFeed = new EdgexPollingPriceFeed();

  let priceUpdateCount = 0;
  const maxUpdates = 10;

  const success = await priceFeed.startPolling((price) => {
    priceUpdateCount++;
    console.log(`💰 [回调 ${priceUpdateCount}] 收到价格: $${price.toFixed(2)}`);

    if (priceUpdateCount >= maxUpdates) {
      console.log(`\n✅ 已接收${maxUpdates}次价格更新，测试成功！`);
      priceFeed.stopPolling();
      process.exit(0);
    }
  }, 1000); // 每秒检查一次

  if (!success) {
    console.log('❌ EdgeX轮询价格启动失败');
    process.exit(1);
  }

  // 30秒后超时
  setTimeout(() => {
    console.log('\n⏰ 30秒测试时间结束');
    if (priceUpdateCount === 0) {
      console.log('❌ 未收到任何价格更新');
    } else {
      console.log(`✅ 共收到${priceUpdateCount}次价格更新`);
    }
    priceFeed.stopPolling();
    process.exit(0);
  }, 30000);
}

// 处理中断信号
process.on('SIGINT', () => {
  console.log('\n🛑 测试中断');
  process.exit(0);
});

// 运行测试
testPollingFeed().catch(error => {
  console.error('❌ 测试失败:', error.message);
  process.exit(1);
});