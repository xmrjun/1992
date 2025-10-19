import WebSocket from 'ws';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const nacl = require('tweetnacl');
import { Aster } from "./exchanges/aster.js";

// 价格数据接口
interface PriceData {
  bid: number;
  ask: number;
  lastPrice: number;
  updateTime: number;
  isValid: boolean;
  source: 'WebSocket' | 'REST API';
}

// WebSocket价格管理器
export class WebSocketPriceManager {
  private asterSDK: Aster;
  private backpackWS: WebSocket | null = null;
  private backpackPrivateWS: WebSocket | null = null;  // 🔥 Backpack私有流

  // 价格缓存
  private asterPrice: PriceData = {
    bid: 0, ask: 0, lastPrice: 0, updateTime: 0, isValid: false, source: 'WebSocket'
  };

  private backpackPrice: PriceData = {
    bid: 0, ask: 0, lastPrice: 0, updateTime: 0, isValid: false, source: 'WebSocket'
  };

  // Backpack API密钥
  private backpackApiKey: string = '';
  private backpackSecretKey: string = '';
  private backpackKeyPair: any = null;  // 🔥 预先生成的密钥对

  constructor(asterApiKey: string, asterApiSecret: string, backpackApiKey?: string, backpackSecretKey?: string) {
    this.asterSDK = new Aster(asterApiKey, asterApiSecret, 'BTCUSDT');
    this.backpackApiKey = backpackApiKey || '';
    this.backpackSecretKey = backpackSecretKey || '';

    // 🔥 在构造函数中预先初始化Backpack密钥对（避免回调中的作用域问题）
    if (this.backpackSecretKey) {
      try {
        const privateKeyBuffer = Buffer.from(this.backpackSecretKey, 'base64');
        const seed = new Uint8Array(privateKeyBuffer.slice(0, 32));
        this.backpackKeyPair = nacl.sign.keyPair.fromSeed(seed);
        console.log('✅ Backpack密钥对初始化成功');
      } catch (error) {
        console.error('❌ Backpack密钥对初始化失败:', error);
      }
    }
  }

  // 🔥 WebSocket优化：公开AsterSDK实例，用于订单/持仓/余额推送
  getAsterSDK(): Aster {
    return this.asterSDK;
  }

  // 初始化所有WebSocket连接
  async initializeAll(): Promise<void> {
    console.log('🚀 初始化双WebSocket价格系统...');

    await Promise.all([
      this.initAsterWebSocket(),
      this.initBackpackWebSocket()
    ]);

    console.log('✅ 双WebSocket价格系统初始化完成');
  }

  // 初始化AsterDx WebSocket
  private async initAsterWebSocket(): Promise<void> {
    try {
      console.log('🔗 初始化 AsterDx WebSocket...');

      // 智能等待WebSocket连接建立 (最多5秒)
      await this.waitForWebSocketConnection();

      // 使用watchTicker获取实时价格数据
      this.asterSDK.watchTicker('BTCUSDT', (ticker: any) => {
        if (ticker && ticker.symbol === 'BTCUSDT') {
          this.asterPrice.lastPrice = parseFloat(ticker.lastPrice || 0);
          this.asterPrice.updateTime = Date.now();

          // 每30秒打印一次AsterDx价格更新
          if (Date.now() % 30000 < 1000) {
            console.log(`📡 AsterDx价格: ${ticker.lastPrice} (Ticker)`);
          }
        }
      });

      // 🔥 优化：使用 watchBookTicker 替代 watchDepth（更轻量、更快）
      this.asterSDK.watchBookTicker('BTCUSDT', (bookTicker: any) => {
        if (bookTicker && bookTicker.symbol === 'BTCUSDT') {
          this.asterPrice.bid = parseFloat(bookTicker.bidPrice || 0);
          this.asterPrice.ask = parseFloat(bookTicker.askPrice || 0);
          this.asterPrice.updateTime = Date.now();
          this.asterPrice.isValid = true;

          // 每30秒打印一次BookTicker更新
          if (Date.now() % 30000 < 1000) {
            console.log(`📊 AsterDx最优价: ${this.asterPrice.bid}/${this.asterPrice.ask} (BookTicker)`);
          }
        }
      });

      console.log('✅ AsterDx WebSocket连接成功');
    } catch (error) {
      console.error('❌ AsterDx WebSocket初始化失败:', error);
      setTimeout(() => this.initAsterWebSocket(), 5000);
    }
  }

  // 初始化Backpack WebSocket - 基于mading2项目实现
  private async initBackpackWebSocket(): Promise<void> {
    try {
      console.log('🔗 初始化 Backpack WebSocket...');

      // 使用mading2项目验证的WebSocket URL
      const wsUrl = 'wss://ws.backpack.exchange';  // 不带斜杠
      this.backpackWS = new WebSocket(wsUrl);

      this.backpackWS.on('open', () => {
        console.log('🔗 Backpack WebSocket连接成功');

        // 使用mading2项目的订阅格式
        const subscribeMessage = {
          method: 'SUBSCRIBE',
          params: [`ticker.BTC_USDC`],  // ticker.符号格式
          id: Date.now()
        };

        console.log('📡 订阅Backpack价格流:', JSON.stringify(subscribeMessage));
        this.backpackWS!.send(JSON.stringify(subscribeMessage));

        // 启动心跳保持连接
        setInterval(() => {
          if (this.backpackWS && this.backpackWS.readyState === WebSocket.OPEN) {
            const pingMsg = {
              method: 'PING',
              id: Date.now()
            };
            this.backpackWS.send(JSON.stringify(pingMsg));
          }
        }, 30000);
      });

      this.backpackWS.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          // 处理PING响应
          if (message.id && message.result === 'PONG') {
            return;
          }

          // 处理订阅确认
          if (message.id && message.result === null) {
            console.log('✅ Backpack订阅确认成功');
            return;
          }

          // 处理ticker数据 - 基于mading2项目的格式
          if (message.data && message.data.e === 'ticker') {
            const tickerData = message.data;
            const price = parseFloat(tickerData.c || 0);  // c = current price

            if (price > 0) {
              // 使用实际的bid/ask如果有，否则模拟价差
              const bid = tickerData.b ? parseFloat(tickerData.b) : price - (price * 0.0005);
              const ask = tickerData.a ? parseFloat(tickerData.a) : price + (price * 0.0005);

              this.backpackPrice = {
                bid: bid,
                ask: ask,
                lastPrice: price,
                updateTime: Date.now(),
                isValid: true,
                source: 'WebSocket'
              };

              // 每30秒打印一次价格更新
              if (Date.now() % 30000 < 1000) {
                console.log(`📡 Backpack价格: ${bid.toFixed(1)}/${ask.toFixed(1)} (${price.toFixed(1)})`);
              }
            }
          }

        } catch (error) {
          console.error('❌ Backpack WebSocket数据解析失败:', error);
        }
      });

      this.backpackWS.on('error', (error) => {
        console.error('❌ Backpack WebSocket错误:', error);
        this.backpackPrice.isValid = false;
      });

      this.backpackWS.on('close', (code, reason) => {
        console.log(`🔌 Backpack WebSocket连接关闭 (${code}: ${reason})，5秒后重连`);
        this.backpackPrice.isValid = false;
        setTimeout(() => this.initBackpackWebSocket(), 5000);
      });

      console.log('✅ Backpack WebSocket初始化完成');
    } catch (error) {
      console.error('❌ Backpack WebSocket初始化失败:', error);
      setTimeout(() => this.initBackpackWebSocket(), 5000);
    }
  }

  // 智能等待WebSocket连接建立
  private async waitForWebSocketConnection(): Promise<void> {
    const maxWaitTime = 5000; // 最多等待5秒
    const checkInterval = 100; // 每100ms检查一次
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      // 检查WebSocket连接状态
      if (this.asterSDK.ws && this.asterSDK.ws.readyState === WebSocket.OPEN) {
        console.log(`⚡ AsterDx WebSocket连接就绪 (用时: ${Date.now() - startTime}ms)`);
        return;
      }

      // 等待100ms后重新检查
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log('⚠️ WebSocket连接等待超时，继续初始化...');
  }

  // 获取AsterDx价格 (纯WebSocket)
  getAsterPrice(): PriceData | null {
    const now = Date.now();
    const dataAge = now - this.asterPrice.updateTime;

    // 检查数据是否在30秒内更新且有效
    if (this.asterPrice.isValid && dataAge < 30000 &&
        this.asterPrice.bid > 0 && this.asterPrice.ask > 0) {
      return { ...this.asterPrice };
    }

    return null; // 无效数据返回null
  }

  // 获取Backpack价格 (纯WebSocket)
  getBackpackPrice(): PriceData | null {
    const now = Date.now();
    const dataAge = now - this.backpackPrice.updateTime;

    // 检查数据是否在30秒内更新且有效
    if (this.backpackPrice.isValid && dataAge < 30000 &&
        this.backpackPrice.bid > 0 && this.backpackPrice.ask > 0) {
      return { ...this.backpackPrice };
    }

    return null; // 无效数据返回null
  }

  // 检查连接状态
  getConnectionStatus(): { aster: boolean; backpack: boolean } {
    return {
      aster: this.asterPrice.isValid,
      backpack: this.backpackPrice.isValid
    };
  }

  // 获取价格统计
  getPriceStats(): string {
    const asterValid = this.asterPrice.isValid ? '✅' : '❌';
    const backpackValid = this.backpackPrice.isValid ? '✅' : '❌';

    return `📊 价格状态: AsterDx ${asterValid} | Backpack ${backpackValid}`;
  }

  // 清理连接
  cleanup(): void {
    if (this.backpackWS) {
      this.backpackWS.close();
    }
    if (this.backpackPrivateWS) {
      this.backpackPrivateWS.close();
    }
    // AsterDx SDK会自动处理清理
  }

  // 🔥 WebSocket优化4：初始化Backpack私有流（订单、持仓、余额推送）
  async initBackpackPrivateStream(
    orderCallback?: (order: any) => void,
    positionCallback?: (position: any) => void,
    balanceCallback?: (balance: any) => void
  ): Promise<void> {
    if (!this.backpackApiKey || !this.backpackSecretKey) {
      console.log('⚠️ Backpack API密钥未配置，跳过私有流订阅');
      return;
    }

    try {
      console.log('🔗 初始化 Backpack 私有WebSocket...');

      const ws = new WebSocket('wss://ws.backpack.exchange');
      this.backpackPrivateWS = ws;

      ws.on('open', () => {
        console.log('✅ Backpack 私有WebSocket连接已建立');

        // 检查密钥对是否已初始化
        if (!this.backpackKeyPair) {
          console.error('❌ Backpack密钥对未初始化，无法订阅私有流');
          return;
        }

        // 生成签名并订阅
        const timestamp = Date.now();
        const window = 5000;
        const signStr = `instruction=subscribe&timestamp=${timestamp}&window=${window}`;

        // 🔥 使用预先生成的密钥对进行签名（避免回调中的作用域问题）
        const messageBytes = new TextEncoder().encode(signStr);
        const signatureBuffer = nacl.sign.detached(messageBytes, this.backpackKeyPair.secretKey);

        const encodedSignature = Buffer.from(signatureBuffer).toString('base64');

        // 订阅订单、持仓、余额更新
        const subscribeMessage = {
          method: 'SUBSCRIBE',
          params: ['account.orderUpdate', 'account.positionUpdate', 'account.balanceUpdate'],
          signature: [this.backpackApiKey, encodedSignature, timestamp.toString(), window.toString()]
        };

        ws.send(JSON.stringify(subscribeMessage));
        console.log('📡 已订阅 Backpack: 订单、持仓、余额推送');
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          // 订单更新
          if (message.stream === 'account.orderUpdate' && message.data) {
            const order = message.data;
            if (orderCallback) {
              orderCallback(order);
            }
          }

          // 持仓更新
          if (message.stream === 'account.positionUpdate' && message.data) {
            const position = message.data;
            if (positionCallback) {
              positionCallback(position);
            }
          }

          // 余额更新
          if (message.stream === 'account.balanceUpdate' && message.data) {
            const balance = message.data;
            if (balanceCallback) {
              balanceCallback(balance);
            }
          }
        } catch (error) {
          console.error('❌ Backpack私有流消息解析失败:', error);
        }
      });

      ws.on('error', (error) => {
        console.error('❌ Backpack私有WebSocket错误:', error.message);
      });

      ws.on('close', () => {
        console.log('🔌 Backpack私有WebSocket连接关闭，5秒后重连');
        setTimeout(() => this.initBackpackPrivateStream(orderCallback, positionCallback, balanceCallback), 5000);
      });

    } catch (error) {
      console.error('❌ Backpack私有流初始化失败:', error);
    }
  }
}