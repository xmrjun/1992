import crypto from 'crypto';
import axios from 'axios';
import WebSocket from 'ws';
import * as starknet from '@scure/starknet';
import keccak from 'keccak';

interface EdgexConfig {
  starkPrivateKey: string;  // Stark私钥（hex格式）
  accountId?: string;  // 账户ID（用于API参数，不是认证）
  baseURL?: string;
  wsURL?: string;
}

/**
 * EdgeX API客户端 - 基于原有Python实现
 * 支持StarkEx签名认证
 */
export class EdgexAPI {
  private config: EdgexConfig;
  private baseURL: string;
  private wsURL: string;
  private K_MODULUS: bigint;

  // WebSocket相关 (Public - 市场数据)
  private ws: WebSocket | null = null;
  private lastPrice: number = 0;
  private priceUpdateCallback?: (price: number) => void;
  private depthUpdateCallback?: (depth: any) => void;
  private reconnectTimer?: NodeJS.Timeout;

  // Private WebSocket (账户数据)
  private privateWs: WebSocket | null = null;
  private orderUpdateCallback?: (order: any) => void;
  private positionUpdateCallback?: (position: any) => void;
  private accountUpdateCallback?: (account: any) => void;
  private tradeUpdateCallback?: (trade: any) => void;

  constructor(config: EdgexConfig) {
    this.config = config;
    this.baseURL = config.baseURL || 'https://pro.edgex.exchange';
    this.wsURL = config.wsURL || 'wss://quote.edgex.exchange/api/v1/public/ws';
    // StarkEx模数
    this.K_MODULUS = BigInt('0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f');
  }

  /**
   * 创建EdgeX ECDSA签名 - 完全按照 Python/Go SDK 官方实现
   */
  private createEdgeXSignature(timestamp: string, method: string, path: string, paramsString: string = ''): string {
    try {
      // 步骤1: 构建签名字符串 {timestamp}{METHOD}{path}{sorted_params}
      const signMessage = `${timestamp}${method.toUpperCase()}${path}${paramsString}`;
      console.log(`签名字符串: ${signMessage}`);

      // 步骤2: 使用 Keccak-256 (Legacy) 哈希，而不是标准 SHA3-256！
      // Python SDK: keccak_hash = keccak.new(digest_bits=256)
      // Go SDK: sha3.NewLegacyKeccak256()
      const msgHashHex = keccak('keccak256').update(signMessage).digest('hex');
      const msgHashBigInt = BigInt('0x' + msgHashHex);

      // 步骤3: 对 EC_ORDER 取模（这个在 sign 内部做，但我们先算好）
      const msgHashMod = msgHashBigInt % this.K_MODULUS;
      const msgHash = msgHashMod.toString(16).padStart(64, '0');

      // 步骤4: 使用 StarkNet ECDSA 签名
      const signature = starknet.sign(msgHash, this.config.starkPrivateKey);

      // 步骤5: 只返回 r + s（Python SDK: f"{sig.r}{sig.s}"）
      const r = signature.r.toString(16).padStart(64, '0');
      const s = signature.s.toString(16).padStart(64, '0');
      const ecdsaSignature = `${r}${s}`;  // 只有 r+s，没有 pubkey！

      console.log(`ECDSA签名 (r+s): ${ecdsaSignature.substring(0, 32)}...`);
      console.log(`   r: ${r.substring(0, 16)}...`);
      console.log(`   s: ${s.substring(0, 16)}...`);
      return ecdsaSignature;
    } catch (error) {
      console.error('EdgeX ECDSA签名生成错误:', error);
      throw error;
    }
  }

  /**
   * 创建认证头 - 按照官方文档只需要2个头
   */
  private createAuthHeaders(method: string, path: string, params: any = {}): any {
    const timestamp = Date.now().toString();

    // 按照官方文档：参数排序后用&连接，不包含?前缀
    const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`);
    const paramsString = sortedParams.join('&');

    // 生成ECDSA签名
    const signature = this.createEdgeXSignature(timestamp, method, path, paramsString);

    // 按照官方文档：只需要2个认证头
    return {
      'X-edgeX-Api-Timestamp': timestamp,
      'X-edgeX-Api-Signature': signature,
      'Content-Type': 'application/json'
    };
  }

  // 移除 createHmacAuthHeaders - 统一使用 createAuthHeaders

  /**
   * 获取账户资产
   * @param accountId 账户ID（可选，如果不提供则使用配置中的accountId）
   */
  async fetchBalance(accountId?: string): Promise<any> {
    try {
      const accId = accountId || this.config.accountId;
      if (!accId) {
        throw new Error('账户ID未提供，请在config中设置accountId或作为参数传入');
      }

      const path = '/api/v1/private/account/getAccountAsset';
      const params = { accountId: accId };
      const headers = this.createAuthHeaders('GET', path, params);

      const url = `${this.baseURL}${path}`;
      const response = await axios.get(url, { params, headers, timeout: 10000 });

      return this.parseBalance(response.data);
    } catch (error) {
      console.error('❌ EdgeX获取余额失败:', error.response?.data || error.message);
      return {};
    }
  }

  /**
   * 解析余额数据 - 基于你原有的API响应格式
   */
  private parseBalance(response: any): any {
    const result: any = {};

    if (response.code === 'SUCCESS' && response.data && response.data.assets) {
      response.data.assets.forEach((asset: any) => {
        const currency = asset.tokenSymbol || asset.symbol;
        const total = parseFloat(asset.balance || 0);
        const available = parseFloat(asset.availableBalance || asset.available || 0);
        const used = total - available;

        result[currency] = {
          free: available,
          used: used,
          total: total
        };
      });
    }

    return result;
  }

  /**
   * 获取BTC价格
   */
  async fetchTicker(symbol: string = 'BTC-USD-PERP'): Promise<any> {
    try {
      // 使用EdgeX的正确API路径获取深度数据
      const response = await axios.get(`${this.baseURL}/api/v1/public/quote/getDepth`, {
        params: {
          contractId: '10000001',  // BTC-USD合约ID
          size: 1
        }
      });

      return this.parseTicker(response.data);
    } catch (error) {
      console.error('❌ EdgeX获取价格失败:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 解析价格数据（从深度数据中提取）
   */
  private parseTicker(response: any): any {
    const data = response.data;

    // 从深度数据中获取最佳买卖价
    let bidPrice = 0;
    let askPrice = 0;

    if (data && data.bids && data.bids.length > 0) {
      bidPrice = parseFloat(data.bids[0].price || data.bids[0][0]);
    }

    if (data && data.asks && data.asks.length > 0) {
      askPrice = parseFloat(data.asks[0].price || data.asks[0][0]);
    }

    // 使用中间价作为当前价格
    const price = bidPrice && askPrice ? (bidPrice + askPrice) / 2 : (bidPrice || askPrice || 0);

    return {
      symbol: 'BTC-USD-PERP',
      last: price,
      bid: bidPrice,
      ask: askPrice,
      high: price,
      low: price,
      volume: 0,
      timestamp: Date.now(),
      price: price,
      lastPrice: price,
      markPrice: price
    };
  }

  /**
   * 获取持仓信息
   * @param accountId 账户ID（可选）
   */
  async fetchPositions(accountId?: string): Promise<any[]> {
    try {
      const accId = accountId || this.config.accountId;
      if (!accId) {
        throw new Error('账户ID未提供');
      }

      const path = '/api/v1/private/account/getPositions';
      const params = { accountId: accId };
      const headers = this.createAuthHeaders('GET', path, params);

      const response = await axios.get(`${this.baseURL}${path}`, {
        params,
        headers
      });

      return this.parsePositions(response.data);
    } catch (error) {
      console.error('❌ EdgeX获取持仓失败:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * 解析持仓数据
   */
  private parsePositions(response: any): any[] {
    if (!response.data || !response.data.positions) return [];

    return response.data.positions
      .filter((pos: any) => parseFloat(pos.size || 0) !== 0)
      .map((pos: any) => {
        const size = parseFloat(pos.size || 0);
        return {
          symbol: pos.symbol || 'BTC-USD-PERP',
          side: size > 0 ? 'long' : 'short',
          contracts: Math.abs(size),
          contractSize: Math.abs(size),
          positionAmt: size,
          notional: Math.abs(parseFloat(pos.notional || 0)),
          entryPrice: parseFloat(pos.entryPrice || 0),
          markPrice: parseFloat(pos.markPrice || 0),
          unrealizedPnl: parseFloat(pos.unrealizedPnl || 0),
          percentage: parseFloat(pos.percentage || 0),
          leverage: parseFloat(pos.leverage || 1)
        };
      });
  }

  /**
   * 下单
   * @param accountId 账户ID（可选）
   */
  async createOrder(symbol: string, type: 'limit' | 'market', side: 'buy' | 'sell', amount: number, price?: number, params?: any, accountId?: string): Promise<any> {
    try {
      const accId = accountId || this.config.accountId;
      if (!accId) {
        throw new Error('账户ID未提供');
      }

      const path = '/api/v1/private/order/createOrder';

      const orderParams: any = {
        accountId: accId,
        contractId: "10000001", // BTCUSD 固定contract ID
        side: side.toUpperCase(),
        orderType: type.toUpperCase(),
        quantity: amount.toString(),
        timeInForce: 'IOC' // 立即成交或取消
      };

      if (type === 'limit' && price) {
        orderParams.price = price.toString();
      }

      if (params?.reduceOnly) {
        orderParams.reduceOnly = true;
      }

      const headers = this.createAuthHeaders('POST', path, orderParams);

      const response = await axios.post(`${this.baseURL}${path}`, orderParams, {
        headers
      });

      console.log('EdgeX 响应:', JSON.stringify(response.data, null, 2));
      return this.parseOrder(response.data);
    } catch (error) {
      console.error('❌ EdgeX下单失败:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 下市价单
   */
  async createMarketOrder(symbol: string, side: 'buy' | 'sell', amount: number, price?: number, params?: any): Promise<any> {
    return this.createOrder(symbol, 'market', side, amount, price, params);
  }

  /**
   * 解析订单数据
   */
  private parseOrder(response: any): any {
    // EdgeX API response format: { code: "SUCCESS", data: { orderId: "..." } }
    const data = response.data || {};

    // For create order response, we may only get orderId
    if (data.orderId && !data.symbol) {
      return {
        id: data.orderId,
        timestamp: Date.now()
      };
    }

    // For full order details (from query endpoints)
    return {
      id: data.orderId || data.id,
      symbol: data.symbol,
      side: data.side?.toLowerCase(),
      amount: parseFloat(data.quantity || data.origQty || 0),
      price: parseFloat(data.price || 0),
      status: data.status?.toLowerCase() || 'open',
      timestamp: Date.now()
    };
  }

  /**
   * 获取成交记录
   * @param accountId 账户ID（可选）
   */
  async fetchMyTrades(symbol: string, limit: number = 100, since?: number, accountId?: string): Promise<any[]> {
    try {
      const accId = accountId || this.config.accountId;
      if (!accId) {
        throw new Error('账户ID未提供');
      }

      const path = '/api/v1/private/account/getTrades';
      const params: any = {
        accountId: accId,
        symbol: 'BTC-USD-PERP',
        limit: limit.toString()
      };

      if (since) {
        params.startTime = since.toString();
      }

      const headers = this.createAuthHeaders('GET', path, params);

      const response = await axios.get(`${this.baseURL}${path}`, {
        params,
        headers
      });

      return this.parseTrades(response.data);
    } catch (error) {
      console.error('❌ EdgeX获取成交记录失败:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * 解析成交记录
   */
  private parseTrades(response: any): any[] {
    if (!response.data || !response.data.trades) return [];

    return response.data.trades.map((trade: any) => ({
      id: trade.tradeId || trade.id,
      orderId: trade.orderId,
      symbol: trade.symbol,
      side: trade.side?.toLowerCase() || (trade.isBuyer ? 'buy' : 'sell'),
      amount: parseFloat(trade.quantity || trade.qty),
      price: parseFloat(trade.price),
      fee: {
        cost: parseFloat(trade.commission || trade.fee || 0),
        currency: trade.commissionAsset || 'USD'
      },
      timestamp: parseInt(trade.timestamp || trade.time),
      time: parseInt(trade.timestamp || trade.time)
    }));
  }

  /**
   * 启动WebSocket连接 - 修复消息解析问题
   */
  async connectWebSocket(callback?: (price: number) => void): Promise<void> {
    try {
      this.priceUpdateCallback = callback;

      console.log('🔌 连接EdgeX WebSocket...');
      console.log(`URL: ${this.wsURL}`);

      this.ws = new WebSocket(this.wsURL);

      this.ws.on('open', () => {
        console.log('✅ EdgeX WebSocket连接成功');

        // 发送正确的EdgeX订阅消息
        const subscribeMessage = {
          type: 'subscribe',
          channel: 'ticker.10000001'  // BTC-USD合约ID
        };

        console.log('📤 发送EdgeX订阅消息:', JSON.stringify(subscribeMessage));
        this.ws!.send(JSON.stringify(subscribeMessage));
      });

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const messageStr = data.toString();

          // 解析JSON消息
          let message: any;
          try {
            message = JSON.parse(messageStr);
          } catch (jsonError) {
            console.log('📥 EdgeX非JSON消息:', messageStr);
            return;
          }

          // 处理心跳消息 - 按照官方文档
          if (message.type === 'ping') {
            const pongMessage = {
              type: 'pong',
              time: message.time
            };
            this.ws!.send(JSON.stringify(pongMessage));
            console.log(`💓 EdgeX心跳: ping(${message.time}) -> pong`);
            return;
          }

          // 处理连接确认消息
          if (message.type === 'connected') {
            console.log('📡 EdgeX WebSocket连接确认:', message.sid || 'OK');
            return;
          }

          // 处理订阅确认消息 - 按照官方文档
          if (message.type === 'subscribed') {
            console.log('✅ EdgeX订阅成功:', message.channel);
            return;
          }

          // 处理错误消息 - 按照官方文档
          if (message.type === 'error') {
            console.error('❌ EdgeX服务器错误:', message.content);
            return;
          }

          // 处理ticker数据 - 实际测试验证格式
          // 实际格式: { "type": "quote-event", "channel": "ticker.10000001", "content": { "dataType": "Snapshot", "data": [...] } }
          // 注意：官方文档说 type="payload"，但实际是 type="quote-event"
          if (message.type === 'quote-event' && message.channel && message.channel.startsWith('ticker.')) {
            const content = message.content;
            if (content && content.data && Array.isArray(content.data)) {
              const tickerData = content.data[0];

              if (tickerData && tickerData.lastPrice) {
                const lastPrice = parseFloat(tickerData.lastPrice);

                if (lastPrice > 0 && lastPrice !== this.lastPrice) {
                  this.lastPrice = lastPrice;
                  console.log(`📊 EdgeX价格更新 [${content.dataType}]: ${lastPrice.toFixed(2)} USD`);

                  if (this.priceUpdateCallback) {
                    this.priceUpdateCallback(lastPrice);
                  }
                }
              } else {
                console.log('⚠️ EdgeX ticker数据格式异常:', JSON.stringify(tickerData));
              }
            }
            return;
          }

          // 处理depth深度数据
          if (message.type === 'quote-event' && message.channel && message.channel.startsWith('depth.')) {
            const content = message.content;
            if (content && content.data && Array.isArray(content.data)) {
              const depthData = content.data[0];

              if (depthData && depthData.bids && depthData.asks) {
                // EdgeX depth格式: { bids: [{price, size}], asks: [{price, size}] }
                const bestBid = depthData.bids[0]?.price || 0;
                const bestAsk = depthData.asks[0]?.price || 0;
                console.log(`📚 EdgeX深度更新 [${content.dataType}]: Bid=${bestBid} Ask=${bestAsk}`);

                if (this.depthUpdateCallback) {
                  this.depthUpdateCallback(depthData);
                }
              }
            }
            return;
          }

          // 打印其他消息用于调试
          console.log('📥 EdgeX未处理消息:', JSON.stringify(message, null, 2));

        } catch (error: any) {
          console.log('❌ EdgeX消息处理失败:', error.message);
          console.log('📥 原始消息:', data.toString());
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ EdgeX WebSocket错误:', error.message);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`🔌 EdgeX WebSocket连接关闭: ${code} - ${reason}`);

        // 5秒后自动重连
        this.reconnectTimer = setTimeout(() => {
          console.log('🔄 EdgeX WebSocket重连中...');
          this.connectWebSocket(callback);
        }, 5000);
      });

    } catch (error) {
      console.error('❌ EdgeX WebSocket连接失败:', error);
    }
  }

  /**
   * 订阅深度数据
   */
  subscribeDepth(contractId: string, callback: (depth: any) => void): void {
    this.depthUpdateCallback = callback;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        type: 'subscribe',
        channel: `depth.${contractId}.15`  // 15档深度
      };

      console.log('📤 订阅EdgeX深度:', JSON.stringify(subscribeMessage));
      this.ws.send(JSON.stringify(subscribeMessage));
    } else {
      console.warn('⚠️ WebSocket未连接，无法订阅深度');
    }
  }

  /**
   * 关闭WebSocket连接
   */
  async closeWebSocket(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
      console.log('🔌 EdgeX WebSocket已关闭');
    }
  }

  /**
   * 获取最新价格（同步）
   */
  getLastPrice(): number {
    return this.lastPrice;
  }

  /**
   * 检查WebSocket连接状态
   */
  isWebSocketConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 检查API连接状态
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.fetchTicker();
      console.log('✅ EdgeX API连接正常');
      return true;
    } catch (error) {
      console.error('❌ EdgeX API连接失败:', error.message);
      return false;
    }
  }

  /**
   * 连接 Private WebSocket - 用于账户、订单、持仓更新
   * 按照官方文档：URL /api/v1/private/ws
   * 需要认证：使用 SEC_WEBSOCKET_PROTOCOL 头传递 base64 编码的认证信息
   */
  async connectPrivateWebSocket(callbacks?: {
    onOrder?: (order: any) => void;
    onPosition?: (position: any) => void;
    onAccount?: (account: any) => void;
    onTrade?: (trade: any) => void;
  }): Promise<void> {
    try {
      if (callbacks?.onOrder) this.orderUpdateCallback = callbacks.onOrder;
      if (callbacks?.onPosition) this.positionUpdateCallback = callbacks.onPosition;
      if (callbacks?.onAccount) this.accountUpdateCallback = callbacks.onAccount;
      if (callbacks?.onTrade) this.tradeUpdateCallback = callbacks.onTrade;

      const accountId = this.config.accountId;
      if (!accountId) {
        throw new Error('账户ID未配置，无法连接Private WebSocket');
      }

      // 生成认证签名（包含accountId参数）
      const timestamp = Date.now().toString();
      const path = '/api/v1/private/ws';
      const params = `accountId=${accountId}`;
      const signature = this.createEdgeXSignature(timestamp, 'GET', path, params);

      // 按照官方文档：创建认证JSON并Base64编码
      const authJson = JSON.stringify({
        'X-edgeX-Api-Signature': signature,
        'X-edgeX-Api-Timestamp': timestamp
      });
      const authBase64 = Buffer.from(authJson).toString('base64');

      const wsURL = `wss://pro.edgex.exchange${path}?${params}`;
      console.log('🔌 连接EdgeX Private WebSocket...');
      console.log(`URL: ${wsURL}`);

      // 创建 WebSocket 连接，使用 SEC_WEBSOCKET_PROTOCOL 头传递认证
      this.privateWs = new WebSocket(wsURL, {
        headers: {
          'Sec-WebSocket-Protocol': authBase64
        }
      });

      this.privateWs.on('open', () => {
        console.log('✅ EdgeX Private WebSocket连接成功');
        console.log('📡 等待账户数据推送（无需订阅）...');
      });

      this.privateWs.on('message', (data: Buffer | string) => {
        try {
          const message = JSON.parse(data.toString());

          // 处理心跳
          if (message.type === 'ping') {
            this.privateWs!.send(JSON.stringify({ type: 'pong', time: message.time }));
            return;
          }

          // 处理交易事件 - 按照官方文档
          if (message.type === 'trade-event' && message.content) {
            const { event, data } = message.content;

            console.log(`📨 EdgeX账户事件: ${event}`);

            // 订单更新
            if (event === 'ORDER_UPDATE' && data.order && this.orderUpdateCallback) {
              data.order.forEach((order: any) => {
                console.log(`📋 订单更新: ${order.orderId} - ${order.status}`);
                this.orderUpdateCallback!(order);
              });
            }

            // 持仓更新
            if (event === 'ACCOUNT_UPDATE' && data.position && this.positionUpdateCallback) {
              data.position.forEach((position: any) => {
                console.log(`📊 持仓更新: ${position.contractId} - ${position.size}`);
                this.positionUpdateCallback!(position);
              });
            }

            // 账户更新
            if (event === 'ACCOUNT_UPDATE' && data.account && this.accountUpdateCallback) {
              data.account.forEach((account: any) => {
                console.log(`💰 账户更新: ${account.coinId}`);
                this.accountUpdateCallback!(account);
              });
            }

            // 成交记录更新
            if (event === 'TRADE_UPDATE' && data.trade && this.tradeUpdateCallback) {
              data.trade.forEach((trade: any) => {
                console.log(`💰 成交记录: ${trade.tradeId} - ${trade.side} ${trade.quantity} @ ${trade.price}`);
                this.tradeUpdateCallback!(trade);
              });
            }

            // 完整快照
            if (event === 'Snapshot') {
              console.log('📸 收到账户快照');
              if (data.position) console.log(`   持仓: ${data.position.length} 个`);
              if (data.order) console.log(`   订单: ${data.order.length} 个`);
              if (data.account) console.log(`   账户: ${data.account.length} 个`);
              if (data.trade) console.log(`   成交: ${data.trade.length} 个`);
            }
          }

          // 处理错误
          if (message.type === 'error') {
            console.error('❌ EdgeX Private WS错误:', message.content);
          }

        } catch (error: any) {
          console.error('❌ Private WS消息处理失败:', error.message);
        }
      });

      this.privateWs.on('error', (error) => {
        console.error('❌ EdgeX Private WebSocket错误:', error.message);
      });

      this.privateWs.on('close', (code, reason) => {
        console.log(`🔌 EdgeX Private WebSocket关闭: ${code} - ${reason.toString()}`);
      });

    } catch (error) {
      console.error('❌ EdgeX Private WebSocket连接失败:', error);
      throw error;
    }
  }

  /**
   * 关闭 Private WebSocket
   */
  async closePrivateWebSocket(): Promise<void> {
    if (this.privateWs) {
      this.privateWs.close();
      this.privateWs = null;
      console.log('🔌 EdgeX Private WebSocket已关闭');
    }
  }

  /**
   * 检查 Private WebSocket 连接状态
   */
  isPrivateWebSocketConnected(): boolean {
    return this.privateWs !== null && this.privateWs.readyState === WebSocket.OPEN;
  }
}

export default EdgexAPI;