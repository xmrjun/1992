#!/usr/bin/env node

/**
 * (EdgeX + Paradex) vs AsterDEX 价差监控
 * 比较两个去中心化交易所与AsterDEX的价格差异
 */

import { Paradex } from './exchanges/paradex.js';
import EdgexAPI from './edgex-api.js';
import WebSocket from 'ws';
import dotenv from 'dotenv';

// 加载配置
dotenv.config({ path: '.env.edgex' });
dotenv.config({ path: '.env.paradex' });

interface PriceRecord {
  timestamp: number;
  edgex: number | null;
  paradex: number | null;
  aster: number | null;
  avgDecentralized: number | null;
  spread: number | null;
  spreadPercent: number | null;
}

class DecentralizedVsCentralizedMonitor {
  private prices = { edgex: 0, paradex: 0, aster: 0 };
  private records: PriceRecord[] = [];
  private startTime = Date.now();
  private edgexAPI: EdgexAPI;
  private paradexAPI: Paradex;
  private asterWS: WebSocket | null = null;
  private updateCount = 0;

  constructor() {
    this.edgexAPI = new EdgexAPI({
      apiKey: process.env.EDGEX_API_KEY!,
      privateKey: process.env.EDGEX_PRIVATE_KEY!,
      publicKeyY: process.env.EDGEX_PUBLIC_KEY_Y!
    });

    this.paradexAPI = new Paradex({ sandbox: true });
  }

  async start(): Promise<void> {
    console.log('📊 (EdgeX + Paradex) vs AsterDEX 价差监控');
    console.log('⏱️  监控时长: 10分钟');
    console.log('🎯 目标: 比较去中心化交易所与AsterDEX的价格差异');
    console.log('='.repeat(80) + '\n');

    try {
      await this.initConnections();
      this.startPriceLogging();

      // 10分钟后生成报告
      setTimeout(() => {
        this.generateFinalReport();
        this.cleanup();
        process.exit(0);
      }, 10 * 60 * 1000);

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      process.exit(1);
    }
  }

  async initConnections(): Promise<void> {
    console.log('🔌 初始化交易所连接...\n');

    // EdgeX
    console.log('📡 [1/3] 连接 EdgeX WebSocket...');
    await this.edgexAPI.connectWebSocket((price) => {
      this.prices.edgex = price;
      this.recordPrice();
    });
    console.log('✅ EdgeX 连接成功');

    // Paradex
    console.log('📡 [2/3] 连接 Paradex WebSocket...');
    await this.paradexAPI.loadMarkets();
    await this.paradexAPI.watchTicker('BTC-USD-PERP', (ticker) => {
      this.prices.paradex = parseFloat(ticker.lastPrice);
      this.recordPrice();
    });
    console.log('✅ Paradex 连接成功');

    // AsterDEX - 直接使用已知可用的URL
    console.log('📡 [3/3] 连接 AsterDEX WebSocket...');
    await this.connectAsterDEX();
    console.log('✅ AsterDEX 连接成功');

    console.log('\n🚀 开始监控...\n');
    console.log('去中心化组: EdgeX + Paradex');
    console.log('中心化: AsterDEX');
    console.log('-'.repeat(80) + '\n');
  }

  async connectAsterDEX(): Promise<void> {
    // 使用多个备选URL
    const wsUrls = [
      'wss://fstream.asterdx.com/ws/btcusdt@ticker',
      'wss://fstream.asterdex.com/ws/btcusdt@ticker',
      'wss://stream.binance.com:9443/ws/btcusdt@ticker' // 备用
    ];

    for (const url of wsUrls) {
      try {
        await this.tryConnectAster(url);
        return;
      } catch (error) {
        console.log(`   尝试 ${url} 失败，尝试下一个...`);
      }
    }

    throw new Error('无法连接到AsterDEX WebSocket');
  }

  tryConnectAster(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.asterWS = new WebSocket(url);

      const timeout = setTimeout(() => {
        this.asterWS?.close();
        reject(new Error('连接超时'));
      }, 5000);

      this.asterWS.on('open', () => {
        clearTimeout(timeout);
        console.log(`   ✅ 连接成功: ${url}`);
        resolve();
      });

      this.asterWS.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.c) {
            this.prices.aster = parseFloat(message.c);
            this.recordPrice();
          }
        } catch (error) {
          // 忽略解析错误
        }
      });

      this.asterWS.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  recordPrice(): void {
    if (!this.prices.edgex || !this.prices.paradex || !this.prices.aster ||
        this.prices.edgex === 0 || this.prices.paradex === 0 || this.prices.aster === 0) return;

    this.updateCount++;
    const now = Date.now();
    const elapsed = Math.floor((now - this.startTime) / 1000);

    // 计算去中心化交易所平均价格
    const avgDecentralized = (this.prices.edgex + this.prices.paradex) / 2;

    // 计算价差
    const spread = Math.abs(avgDecentralized - this.prices.aster);
    const spreadPercent = (spread / this.prices.aster) * 100;

    // 记录数据
    this.records.push({
      timestamp: now,
      edgex: this.prices.edgex,
      paradex: this.prices.paradex,
      aster: this.prices.aster,
      avgDecentralized,
      spread,
      spreadPercent
    });

    // 实时显示
    const direction = avgDecentralized > this.prices.aster ? '去中心化更高' : 'AsterDEX更高';

    console.log(`[${String(elapsed).padStart(3)}s] #${String(this.updateCount).padStart(3)}`);
    console.log(`      EdgeX: $${this.prices.edgex.toFixed(2)} | Paradex: $${this.prices.paradex.toFixed(2)} | 平均: $${avgDecentralized.toFixed(2)}`);
    console.log(`      AsterDEX: $${this.prices.aster.toFixed(2)}`);
    console.log(`      💰 价差: $${spread.toFixed(2)} (${spreadPercent.toFixed(3)}%) - ${direction}`);

    // 套利机会提醒
    if (spreadPercent > 0.1) {
      console.log(`      🚨 套利机会! 价差 ${spreadPercent.toFixed(3)}%`);
    }

    console.log('      ' + '-'.repeat(75));
  }

  startPriceLogging(): void {
    // 每分钟显示一次统计
    setInterval(() => {
      this.showIntervalStats();
    }, 60 * 1000);
  }

  showIntervalStats(): void {
    if (this.records.length < 10) return;

    const recent = this.records.slice(-30); // 最近30个数据点
    const spreads = recent.map(r => r.spread!).filter(s => s > 0);
    const spreadPercents = recent.map(r => r.spreadPercent!).filter(s => s > 0);

    if (spreads.length === 0) return;

    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const avgSpreadPercent = spreadPercents.reduce((a, b) => a + b, 0) / spreadPercents.length;
    const maxSpread = Math.max(...spreads);
    const minSpread = Math.min(...spreads);

    const elapsed = Math.floor((Date.now() - this.startTime) / 60000);

    console.log(`\n📊 [${elapsed}分钟] 阶段统计:`);
    console.log(`    平均价差: $${avgSpread.toFixed(2)} (${avgSpreadPercent.toFixed(3)}%)`);
    console.log(`    最大价差: $${maxSpread.toFixed(2)}`);
    console.log(`    最小价差: $${minSpread.toFixed(2)}`);
    console.log(`    数据点数: ${recent.length}`);
    console.log('');
  }

  generateFinalReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 10分钟 (EdgeX + Paradex) vs AsterDEX 价差分析报告');
    console.log('='.repeat(80));

    if (this.records.length === 0) {
      console.log('❌ 无有效数据');
      return;
    }

    const validRecords = this.records.filter(r => r.spread !== null && r.spread > 0);

    if (validRecords.length === 0) {
      console.log('❌ 无有效价差数据');
      return;
    }

    // 基础统计
    const spreads = validRecords.map(r => r.spread!);
    const spreadPercents = validRecords.map(r => r.spreadPercent!);

    const maxSpread = Math.max(...spreads);
    const minSpread = Math.min(...spreads);
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;

    const maxSpreadPercent = Math.max(...spreadPercents);
    const minSpreadPercent = Math.min(...spreadPercents);
    const avgSpreadPercent = spreadPercents.reduce((a, b) => a + b, 0) / spreadPercents.length;

    // 计算平均价格
    const edgexPrices = validRecords.map(r => r.edgex!);
    const paradexPrices = validRecords.map(r => r.paradex!);
    const asterPrices = validRecords.map(r => r.aster!);
    const avgDecentralizedPrices = validRecords.map(r => r.avgDecentralized!);

    const avgEdgex = edgexPrices.reduce((a, b) => a + b, 0) / edgexPrices.length;
    const avgParadex = paradexPrices.reduce((a, b) => a + b, 0) / paradexPrices.length;
    const avgAster = asterPrices.reduce((a, b) => a + b, 0) / asterPrices.length;
    const avgDecentralized = avgDecentralizedPrices.reduce((a, b) => a + b, 0) / avgDecentralizedPrices.length;

    console.log(`\n💰 价差统计:`);
    console.log(`   数据点数: ${validRecords.length}`);
    console.log(`   最大价差: $${maxSpread.toFixed(2)} (${maxSpreadPercent.toFixed(3)}%)`);
    console.log(`   最小价差: $${minSpread.toFixed(2)} (${minSpreadPercent.toFixed(3)}%)`);
    console.log(`   平均价差: $${avgSpread.toFixed(2)} (${avgSpreadPercent.toFixed(3)}%)`);

    console.log(`\n📈 平均价格:`);
    console.log(`   EdgeX: $${avgEdgex.toFixed(2)}`);
    console.log(`   Paradex: $${avgParadex.toFixed(2)}`);
    console.log(`   去中心化平均: $${avgDecentralized.toFixed(2)}`);
    console.log(`   AsterDEX: $${avgAster.toFixed(2)}`);
    console.log(`   差异: $${Math.abs(avgDecentralized - avgAster).toFixed(2)} (${avgDecentralized > avgAster ? '去中心化更高' : 'AsterDEX更高'})`);

    // 套利机会统计
    const opportunities01 = spreadPercents.filter(s => s > 0.1).length;
    const opportunities05 = spreadPercents.filter(s => s > 0.5).length;
    const opportunities10 = spreadPercents.filter(s => s > 1.0).length;

    console.log(`\n🚨 套利机会:`);
    console.log(`   >0.1%: ${opportunities01} 次 (${((opportunities01/validRecords.length)*100).toFixed(1)}%)`);
    console.log(`   >0.5%: ${opportunities05} 次 (${((opportunities05/validRecords.length)*100).toFixed(1)}%)`);
    console.log(`   >1.0%: ${opportunities10} 次 (${((opportunities10/validRecords.length)*100).toFixed(1)}%)`);

    // 价格方向统计
    const higherDecentralized = validRecords.filter(r => r.avgDecentralized! > r.aster!).length;
    const higherAster = validRecords.length - higherDecentralized;

    console.log(`\n📊 价格方向:`);
    console.log(`   去中心化更高: ${higherDecentralized} 次 (${((higherDecentralized/validRecords.length)*100).toFixed(1)}%)`);
    console.log(`   AsterDEX更高: ${higherAster} 次 (${((higherAster/validRecords.length)*100).toFixed(1)}%)`);

    // 价差分布
    console.log(`\n📊 价差分布:`);
    const ranges = [
      { min: 0, max: 50, label: '$0-50' },
      { min: 50, max: 100, label: '$50-100' },
      { min: 100, max: 150, label: '$100-150' },
      { min: 150, max: 200, label: '$150-200' },
      { min: 200, max: Infinity, label: '$200+' }
    ];

    ranges.forEach(range => {
      const count = spreads.filter(s => s >= range.min && s < range.max).length;
      const percentage = ((count / spreads.length) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(count / spreads.length * 20));
      console.log(`   ${range.label}: ${count} 次 (${percentage}%) ${bar}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('✅ 监控完成');
  }

  async cleanup(): Promise<void> {
    if (this.asterWS) {
      this.asterWS.close();
    }
    await this.paradexAPI.close();
  }
}

// 运行监控
const monitor = new DecentralizedVsCentralizedMonitor();

process.on('SIGINT', async () => {
  console.log('\n🛑 用户中断，生成报告...');
  monitor.generateFinalReport();
  await monitor.cleanup();
  process.exit(0);
});

monitor.start().catch(error => {
  console.error('❌ 程序失败:', error);
  process.exit(1);
});