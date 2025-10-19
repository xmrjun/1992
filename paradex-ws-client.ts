import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Paradex WebSocket 客户端 - TypeScript Wrapper
 * 通过 Python 服务提供实时 WebSocket 数据
 */

export interface ParadexPriceData {
  market: string;
  bid: number;
  ask: number;
  mid: number;
  bid_size: number;
  ask_size: number;
  spread: number;
}

export interface ParadexWSConfig {
  l1Address?: string;
  l2PrivateKey?: string;
  market?: string;
  testnet?: boolean;
}

export class ParadexWebSocketClient extends EventEmitter {
  private pythonProcess: ChildProcess | null = null;
  private config: ParadexWSConfig;
  private lastPrice: number = 0;
  private isConnected: boolean = false;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  // 命令处理
  private commandCallbacks: Map<string, (result: any) => void> = new Map();
  private commandId: number = 0;

  // 回调函数
  private priceCallback?: (price: number) => void;
  private orderBookCallback?: (orderbook: any) => void;
  private accountCallback?: (account: any) => void;

  constructor(config: ParadexWSConfig = {}) {
    super();
    this.config = {
      l1Address: config.l1Address || process.env.PARADEX_L1_ADDRESS,
      l2PrivateKey: config.l2PrivateKey || process.env.PARADEX_L2_PRIVATE_KEY,
      market: config.market || 'BTC-USD-PERP',
      testnet: config.testnet !== undefined ? config.testnet : (process.env.PARADEX_TESTNET !== 'false')
    };
  }

  /**
   * 连接 WebSocket（启动 Python 服务）
   */
  async connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 启动 Paradex WebSocket 服务...');

        // 设置环境变量
        const env = {
          ...process.env,
          PARADEX_L1_ADDRESS: this.config.l1Address,
          PARADEX_L2_PRIVATE_KEY: this.config.l2PrivateKey,
          PARADEX_MARKET: this.config.market,
          PARADEX_TESTNET: this.config.testnet ? 'true' : 'false'
        };

        // 启动 Python 进程
        this.pythonProcess = spawn('python3', ['/root/aster-bot/paradex_ws_service.py'], {
          env,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let connectionTimeout: NodeJS.Timeout | undefined;
        let isResolved = false;

        // 监听 stdout（数据流）
        this.pythonProcess.stdout?.on('data', (data: Buffer) => {
          try {
            const lines = data.toString().split('\n').filter(line => line.trim());

            lines.forEach(line => {
              try {
                const message = JSON.parse(line);
                this.handleMessage(message);

                // 首次连接成功
                if (message.type === 'connected' && !isResolved) {
                  isResolved = true;
                  this.isConnected = true;
                  this.reconnectAttempts = 0;
                  if (connectionTimeout) clearTimeout(connectionTimeout);
                  console.log('✅ Paradex WebSocket 连接成功');
                  console.log(`   L2地址: ${message.data.l2_address}`);
                  resolve(true);
                  this.emit('connected', message.data);
                }

                // 服务就绪
                if (message.type === 'ready') {
                  console.log('🎯 Paradex WebSocket 服务就绪');
                  this.emit('ready');
                }
              } catch (parseError) {
                // 忽略非 JSON 行
              }
            });
          } catch (error) {
            console.error('❌ 处理 stdout 数据失败:', error);
          }
        });

        // 监听 stderr（日志）
        this.pythonProcess.stderr?.on('data', (data: Buffer) => {
          const log = data.toString();
          // 只显示关键日志
          if (log.includes('ERROR') || log.includes('WARNING') || log.includes('✅') || log.includes('🚀')) {
            console.log('[Paradex Python]', log.trim());
          }
        });

        // 监听进程错误
        this.pythonProcess.on('error', (error) => {
          console.error('❌ Python 进程错误:', error);
          if (!isResolved) {
            isResolved = true;
            if (connectionTimeout) clearTimeout(connectionTimeout);
            reject(error);
          }
          this.handleDisconnect();
        });

        // 监听进程退出
        this.pythonProcess.on('exit', (code, signal) => {
          console.log(`⚠️ Python 进程退出: code=${code}, signal=${signal}`);
          if (!isResolved) {
            isResolved = true;
            if (connectionTimeout) clearTimeout(connectionTimeout);
            reject(new Error(`Python进程异常退出: ${code}`));
          }
          this.handleDisconnect();
        });

        // 连接超时（30秒）
        connectionTimeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            console.error('❌ Paradex WebSocket 连接超时');
            this.close();
            reject(new Error('连接超时'));
          }
        }, 30000);

      } catch (error) {
        console.error('❌ 启动 Paradex WebSocket 失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(message: any): void {
    try {
      switch (message.type) {
        case 'price_update':
          this.handlePriceUpdate(message.data);
          break;

        case 'orderbook_update':
          if (this.orderBookCallback) {
            this.orderBookCallback(message.data);
          }
          this.emit('orderbook', message.data);
          break;

        case 'account_update':
          if (this.accountCallback) {
            this.accountCallback(message.data);
          }
          this.emit('account', message.data);
          break;

        case 'positions_update':
          this.emit('positions', message.data);
          break;

        case 'orders_update':
          this.emit('orders', message.data);
          break;

        case 'trade_update':
          this.emit('trade', message.data);
          break;

        case 'fill_update':
          this.emit('fill', message.data);
          break;

        case 'command_result':
          // 处理命令响应
          this.handleCommandResult(message.data);
          break;

        case 'error':
          console.error('❌ Paradex 服务错误:', message.data.message);
          this.emit('error', new Error(message.data.message));
          break;

        case 'disconnected':
          console.log('🔌 Paradex 服务断开连接');
          this.handleDisconnect();
          break;
      }
    } catch (error) {
      console.error('❌ 处理消息失败:', error);
    }
  }

  /**
   * 处理价格更新
   */
  private handlePriceUpdate(data: ParadexPriceData): void {
    const price = data.mid;

    if (price > 0 && price !== this.lastPrice) {
      this.lastPrice = price;

      // 触发回调
      if (this.priceCallback) {
        this.priceCallback(price);
      }

      // 触发事件
      this.emit('price', price);
      this.emit('ticker', data);
    }
  }

  /**
   * 处理断线
   */
  private handleDisconnect(): void {
    this.isConnected = false;
    this.emit('disconnected');

    // 自动重连（如果未超过最大重试次数）
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 准备重连 Paradex WebSocket... (尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      this.reconnectTimer = setTimeout(async () => {
        try {
          await this.connect();
        } catch (error) {
          console.error('❌ 重连失败:', error);
        }
      }, 5000);
    } else {
      console.error('❌ Paradex WebSocket 重连失败，已达最大重试次数');
    }
  }

  /**
   * 监听价格更新
   */
  watchTicker(market: string, callback: (price: number) => void): void {
    this.config.market = market;
    this.priceCallback = callback;
  }

  /**
   * 监听订单簿
   */
  watchOrderBook(market: string, callback: (orderbook: any) => void): void {
    this.config.market = market;
    this.orderBookCallback = callback;
  }

  /**
   * 监听账户更新
   */
  watchAccount(callback: (account: any) => void): void {
    this.accountCallback = callback;
  }

  /**
   * 获取最新价格（同步）
   */
  getLastPrice(): number {
    return this.lastPrice;
  }

  /**
   * 检查连接状态
   */
  isWebSocketConnected(): boolean {
    return this.isConnected && this.pythonProcess !== null && !this.pythonProcess.killed;
  }

  /**
   * 处理命令响应
   */
  private handleCommandResult(result: any): void {
    const { id, success, data, error } = result;
    const callback = this.commandCallbacks.get(id);

    if (callback) {
      this.commandCallbacks.delete(id);
      if (success) {
        callback({ success: true, data });
      } else {
        callback({ success: false, error });
      }
    }
  }

  /**
   * 发送命令到 Python 服务
   */
  private async sendCommand(action: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.pythonProcess || !this.pythonProcess.stdin) {
        reject(new Error('Python 进程未启动'));
        return;
      }

      const id = `cmd_${++this.commandId}`;
      const command = {
        id,
        action,
        params
      };

      // 设置超时
      const timeout = setTimeout(() => {
        this.commandCallbacks.delete(id);
        reject(new Error(`命令超时: ${action}`));
      }, 30000); // 30秒超时

      // 注册回调
      this.commandCallbacks.set(id, (result: any) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.error || '命令执行失败'));
        }
      });

      // 发送命令
      try {
        this.pythonProcess.stdin.write(JSON.stringify(command) + '\n');
      } catch (error) {
        this.commandCallbacks.delete(id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * 创建市价单
   */
  async createMarketOrder(market: string, side: 'buy' | 'sell', size: number): Promise<any> {
    return this.sendCommand('create_order', {
      market,
      side: side.toUpperCase(),
      type: 'MARKET',
      size: size.toString()
    });
  }

  /**
   * 创建限价单
   */
  async createLimitOrder(market: string, side: 'buy' | 'sell', size: number, price: number): Promise<any> {
    return this.sendCommand('create_order', {
      market,
      side: side.toUpperCase(),
      type: 'LIMIT',
      size: size.toString(),
      price: price.toString()
    });
  }

  /**
   * 撤销订单
   */
  async cancelOrder(orderId: string): Promise<any> {
    return this.sendCommand('cancel_order', {
      order_id: orderId
    });
  }

  /**
   * 获取账户信息
   */
  async getAccount(): Promise<any> {
    return this.sendCommand('get_account', {});
  }

  /**
   * 获取持仓
   */
  async getPositions(market?: string): Promise<any> {
    return this.sendCommand('get_positions', { market });
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    console.log('🔌 关闭 Paradex WebSocket...');

    this.isConnected = false;

    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // 终止 Python 进程
    if (this.pythonProcess) {
      this.pythonProcess.kill('SIGTERM');

      // 等待进程退出
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.pythonProcess && !this.pythonProcess.killed) {
            this.pythonProcess.kill('SIGKILL');
          }
          resolve();
        }, 3000);

        this.pythonProcess!.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.pythonProcess = null;
    }

    console.log('✅ Paradex WebSocket 已关闭');
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      console.log('✅ Paradex WebSocket 测试成功');
      return true;
    } catch (error) {
      console.error('❌ Paradex WebSocket 测试失败:', error);
      return false;
    }
  }
}

export default ParadexWebSocketClient;
