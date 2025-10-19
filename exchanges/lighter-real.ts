#!/usr/bin/env node

/**
 * Lighter.xyz 真实交易接口
 * 基于我们成功的Python脚本实现
 */

import { spawn } from 'child_process';
import WebSocket from 'ws';

export interface LighterRealConfig {
  testnet?: boolean;
  marketId?: number;
}

export interface LighterRealTicker {
  symbol: string;
  lastPrice: number;
  timestamp: number;
}

export interface LighterRealOrder {
  id: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  status: 'success' | 'failed';
  txHash?: string;
  timestamp: number;
}

/**
 * Lighter.xyz 真实交易客户端
 * 直接调用成功的Python脚本执行交易
 */
export class LighterReal {
  private config: LighterRealConfig;
  private ws: WebSocket | null = null;
  private currentPrice: number = 0;
  private tickerCallback: ((ticker: LighterRealTicker) => void) | null = null;

  constructor(config: LighterRealConfig = {}) {
    this.config = {
      testnet: false,
      marketId: 1,
      ...config
    };
  }

  /**
   * 获取实时价格 - WebSocket
   */
  async watchTicker(marketId: number, callback: (ticker: LighterRealTicker) => void): Promise<void> {
    this.tickerCallback = callback;

    try {
      this.ws = new WebSocket('wss://mainnet.zklighter.elliot.ai/stream');

      this.ws.on('open', () => {
        console.log('✅ Lighter WebSocket连接成功');

        // 订阅市场数据
        const subscribeMsg = {
          type: 'subscribe',
          channel: `market_stats/${marketId}`
        };

        this.ws?.send(JSON.stringify(subscribeMsg));
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.market_stats && message.market_stats.last_trade_price) {
            const lastPrice = parseFloat(message.market_stats.last_trade_price);
            this.currentPrice = lastPrice;

            const ticker: LighterRealTicker = {
              symbol: 'BTCUSDT',
              lastPrice,
              timestamp: Date.now()
            };

            if (this.tickerCallback) {
              this.tickerCallback(ticker);
            }
          }
        } catch (error) {
          // 静默处理解析错误
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ Lighter WebSocket错误:', error.message);
      });

    } catch (error) {
      console.error('❌ Lighter WebSocket连接失败:', error.message);
    }
  }

  /**
   * 开多单 (买入)
   */
  async openLong(amount: number): Promise<LighterRealOrder> {
    return this.executePythonScript('lighter_open_long.py', amount);
  }

  /**
   * 开空单 (卖出)
   */
  async openShort(amount: number): Promise<LighterRealOrder> {
    return this.executePythonScript('lighter_open_short.py', amount);
  }

  /**
   * 平多单 (卖出平仓)
   */
  async closeLong(amount: number): Promise<LighterRealOrder> {
    return this.executePythonScript('lighter_close_long.py', amount);
  }

  /**
   * 平空单 (买入平仓)
   */
  async closeShort(amount: number): Promise<LighterRealOrder> {
    return this.executePythonScript('lighter_close_short.py', amount);
  }

  /**
   * 市价买单 (通用)
   */
  async marketBuy(amount: number): Promise<LighterRealOrder> {
    return this.openLong(amount);
  }

  /**
   * 市价卖单 (通用)
   */
  async marketSell(amount: number): Promise<LighterRealOrder> {
    return this.openShort(amount);
  }

  /**
   * 执行Python交易脚本
   */
  private async executePythonScript(scriptName: string, amount?: number): Promise<LighterRealOrder> {
    return new Promise((resolve, reject) => {
      console.log(`🐍 执行Python脚本: ${scriptName}`);

      const python = spawn('python3', [scriptName], {
        cwd: process.cwd()
      });

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          // 1. 检查是否有明确的错误标记
          const errorMatch = output.match(/❌.*失败[：:]\s*(.+)/);
          if (errorMatch) {
            const order: LighterRealOrder = {
              id: `lighter_${Date.now()}`,
              side: scriptName.includes('long') || scriptName.includes('buy') ? 'buy' : 'sell',
              amount: amount || 0.01,
              price: this.currentPrice,
              status: 'failed',
              timestamp: Date.now()
            };
            console.log(`❌ Lighter交易明确失败: ${errorMatch[1]}`);
            resolve(order);
            return;
          }

          // 2. 提取实际交易哈希和API状态
          const successMatch = output.match(/✅.*成功.*TX:\s*/);
          const txHashMatch = output.match(/tx_hash['"]\s*[:=]\s*['"']([a-fA-F0-9]+)['"']/);
          const apiCodeMatch = output.match(/code=(\d+)/);
          const isApiSuccess = apiCodeMatch && apiCodeMatch[1] === '200';

          const order: LighterRealOrder = {
            id: `lighter_${Date.now()}`,
            side: scriptName.includes('long') || scriptName.includes('buy') ? 'buy' : 'sell',
            amount: amount || 0.01,
            price: this.currentPrice,
            status: (successMatch && isApiSuccess && !errorMatch) ? 'success' : 'failed',
            txHash: txHashMatch ? txHashMatch[1] : undefined,
            timestamp: Date.now()
          };

          // 3. 增强日志记录
          if (order.status === 'success') {
            console.log(`✅ Lighter订单提交成功: ${order.side} ${order.amount} BTC`);
            if (order.txHash) {
              console.log(`📋 交易哈希: ${order.txHash.substring(0, 16)}...`);
            }
            console.log(`⚠️  注意: 这是提交成功，需要验证实际执行状态`);
          } else {
            console.log(`❌ Lighter交易失败或状态不明确`);
            console.log(`   原因: ${!successMatch ? '无成功标记' : !isApiSuccess ? 'API非200状态' : '其他错误'}`);
            if (output.length > 0) {
              console.log(`   输出: ${output.substring(0, 200)}...`);
            }
          }

          resolve(order);
        } else {
          console.error(`❌ Python脚本执行失败 (${code}):`, errorOutput);
          reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
        }
      });

      python.on('error', (error) => {
        console.error(`❌ 无法启动Python脚本:`, error.message);
        reject(error);
      });
    });
  }

  /**
   * 获取当前价格
   */
  getCurrentPrice(): number {
    return this.currentPrice;
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default LighterReal;