import crypto from 'crypto';
import WebSocket from 'ws';

// WebSocket polyfill for Node.js
globalThis.WebSocket = WebSocket as any;

export type StringBoolean = "true" | "false";

export type DepthLimit = 5 | 10 | 20 | 50 | 100 | 500 | 1000;

export interface KlineParams {
    symbol: string;
    interval: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
}

export interface SubscribeParams {
    method?: string;
    params: string[];
    id: number;
}

export type MarginType = "ISOLATED" | "CROSSED";

export type OrderSide = "BUY" | "SELL";
export type PositionSide = "BOTH" | "LONG" | "SHORT";
export type OrderType = "LIMIT" | "MARKET" | "STOP" | "STOP_MARKET" | "TAKE_PROFIT" | "TAKE_PROFIT_MARKET" | "TRAILING_STOP_MARKET";
export type TimeInForce = "GTC" | "IOC" | "FOK" | "GTX";
export type WorkingType = "MARK_PRICE" | "CONTRACT_PRICE";

export interface CreateOrderParams {
    symbol: string;
    side: OrderSide;
    positionSide?: PositionSide;
    type: OrderType;
    reduceOnly?: StringBoolean;
    quantity?: number;
    price?: number;
    newClientOrderId?: string;
    stopPrice?: number;
    closePosition?: StringBoolean;
    activationPrice?: number;
    callbackRate?: number;
    timeInForce?: TimeInForce;
    workingType?: WorkingType;
}

// 资产信息
export interface AsterAccountAsset {
    asset: string;
    walletBalance: string;
    unrealizedProfit: string;
    marginBalance: string;
    maintMargin: string;
    initialMargin: string;
    positionInitialMargin: string;
    openOrderInitialMargin: string;
    crossWalletBalance: string;
    crossUnPnl: string;
    availableBalance: string;
    maxWithdrawAmount: string;
    marginAvailable: boolean;
    updateTime: number;
}

// 持仓信息
export interface AsterAccountPosition {
    symbol: string;
    initialMargin: string;
    maintMargin: string;
    unrealizedProfit: string;
    positionInitialMargin: string;
    openOrderInitialMargin: string;
    leverage: string;
    isolated: boolean;
    entryPrice: string;
    maxNotional: string;
    positionSide: string;
    positionAmt: string;
    updateTime: number;
    // ws推送专有字段
    cr?: string; // 累计实现盈亏
    mt?: string; // 保证金模式
    iw?: string; // 仓位保证金
}

// 账户快照
export interface AsterAccountSnapshot {
    feeTier: number;
    canTrade: boolean;
    canDeposit: boolean;
    canWithdraw: boolean;
    updateTime: number;
    totalInitialMargin: string;
    totalMaintMargin: string;
    totalWalletBalance: string;
    totalUnrealizedProfit: string;
    totalMarginBalance: string;
    totalPositionInitialMargin: string;
    totalOpenOrderInitialMargin: string;
    totalCrossWalletBalance: string;
    totalCrossUnPnl: string;
    availableBalance: string;
    maxWithdrawAmount: string;
    assets: AsterAccountAsset[];
    positions: AsterAccountPosition[];
}

// 订单信息
export interface AsterOrder {
    avgPrice: string;           // 平均成交价
    clientOrderId: string;      // 用户自定义订单号
    cumQuote: string;           // 成交金额
    executedQty: string;        // 成交量
    orderId: number;            // 系统订单号
    origQty: string;            // 原始委托数量
    origType: string;           // 触发前订单类型
    price: string;              // 委托价格
    reduceOnly: boolean;        // 是否仅减仓
    side: string;               // 买卖方向
    positionSide: string;       // 持仓方向
    status: string;             // 订单状态
    stopPrice: string;          // 触发价
    closePosition: boolean;     // 是否条件全平仓
    symbol: string;             // 交易对
    time: number;               // 订单时间
    timeInForce: string;        // 有效方法
    type: string;               // 订单类型
    activatePrice?: string;     // 跟踪止损激活价格
    priceRate?: string;         // 跟踪止损回调比例
    updateTime: number;         // 更新时间
    workingType: string;        // 条件价格触发类型
    priceProtect: boolean;      // 是否开启条件单触发保护

    // ws推送专有字段
    eventType?: string;         // 事件类型 e
    eventTime?: number;         // 事件时间 E
    matchTime?: number;         // 撮合时间 T
    lastFilledQty?: string;     // 末次成交量 l
    lastFilledPrice?: string;   // 末次成交价格 L
    commissionAsset?: string;   // 手续费资产类型 N
    commission?: string;        // 手续费数量 n
    tradeId?: number;           // 成交ID t
    bidValue?: string;          // 买单净值 b
    askValue?: string;          // 卖单净值 a
    isMaker?: boolean;          // 该成交是作为挂单成交吗 m
    wt?: string;                // 触发价类型
    ot?: string;                // 原始订单类型
    cp?: boolean;               // 是否为触发平仓单
    rp?: string;                // 该交易实现盈亏
    _pushedOnce?: boolean;      // 标记是否已推送过一次
}

// 深度档位
export type AsterDepthLevel = [string, string];

// 深度数据
export interface AsterDepth {
    eventType?: string;      // 事件类型 e（ws推送）
    eventTime?: number;      // 事件时间 E
    tradeTime?: number;      // 交易/撮合时间 T
    symbol?: string;         // 交易对 s
    firstUpdateId?: number;  // U（ws推送）
    lastUpdateId: number;    // u（ws推送）/lastUpdateId（http）
    prevUpdateId?: number;   // pu（ws推送）
    bids: AsterDepthLevel[]; // 买单
    asks: AsterDepthLevel[]; // 卖单
}

// Ticker 数据
export interface AsterTicker {
    // 公共字段
    symbol: string;             // 交易对
    lastPrice: string;          // 最新成交价
    openPrice: string;          // 24小时内第一次成交的价格
    highPrice: string;          // 24小时最高价
    lowPrice: string;           // 24小时最低价
    volume: string;             // 24小时成交量
    quoteVolume: string;        // 24小时成交额

    // http专有
    priceChange?: string;           // 24小时价格变动
    priceChangePercent?: string;    // 24小时价格变动百分比
    weightedAvgPrice?: string;      // 加权平均价
    lastQty?: string;               // 最近一次成交额
    openTime?: number;              // 24小时内，第一笔交易的发生时间
    closeTime?: number;             // 24小时内，最后一笔交易的发生时间
    firstId?: number;               // 首笔成交id
    lastId?: number;                // 末笔成交id
    count?: number;                 // 成交笔数

    // ws推送专有
    eventType?: string;             // 事件类型 e
    eventTime?: number;             // 事件时间 E
}

// K线数据
export interface AsterKline {
    openTime: number;                // 开盘时间
    open: string;                    // 开盘价
    high: string;                    // 最高价
    low: string;                     // 最低价
    close: string;                   // 收盘价
    volume: string;                  // 成交量
    closeTime: number;               // 收盘时间
    quoteAssetVolume: string;        // 成交额
    numberOfTrades: number;          // 成交笔数
    takerBuyBaseAssetVolume: string; // 主动买入成交量
    takerBuyQuoteAssetVolume: string;// 主动买入成交额

    // ws推送专有
    eventType?: string;              // 事件类型 e
    eventTime?: number;              // 事件时间 E
    symbol?: string;                 // 交易对 s
    interval?: string;               // K线间隔 i
    firstTradeId?: number;           // 第一笔成交ID f
    lastTradeId?: number;            // 末一笔成交ID L
    isClosed?: boolean;              // 这根K线是否完结 x
}

export class Aster {
    baseURL: string;
    websocketURL: string;
    ws: WebSocket;
    private accountUpdateCallbacks: Array<(data: any) => void> = [];
    private listenKey?: string;
    private pongIntervalId?: ReturnType<typeof setInterval>;
    private accountSnapshot: any = null;
    private orderUpdateCallbacks: Array<(data: any) => void> = [];
    private listenKeyKeepAliveIntervalId?: ReturnType<typeof setInterval>;
    private subscribedChannels: Set<string> = new Set();
    private listenKeyChannel: string | null = null;
    private reconnectTimeoutId?: ReturnType<typeof setTimeout>;
    private defaultMarket: string;
    private openOrders: Map<number, any> = new Map();
    private depthUpdateCallbacks: Array<(data: any) => void> = [];
    private lastDepthData: any = null;
    private tickerUpdateCallbacks: Array<(data: any) => void> = [];
    private lastTickerData: any = null;
    private klineUpdateCallbacks: Array<(data: any[]) => void> = [];
    private lastKlines: any[] = [];
    private klineSymbol: string = '';
    private klineInterval: string = '';
    private pollingIntervalId?: ReturnType<typeof setInterval>;

    // 🔥 新增 WebSocket 回调支持
    private bookTickerUpdateCallbacks: Array<(data: any) => void> = [];
    private markPriceUpdateCallbacks: Array<(data: any) => void> = [];
    private aggTradeUpdateCallbacks: Array<(data: any) => void> = [];
    private lastBookTicker: any = null;
    private lastMarkPrice: any = null;
    constructor(private readonly apiKey: string, private readonly apiSecret: string, defaultMarket: string = 'BTCUSDT') {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseURL = 'https://fapi.asterdex.com';
        this.websocketURL = 'wss://fstream.asterdex.com/ws';
        this.defaultMarket = defaultMarket;

        this.initWebSocket();
        this.startPolling(); // 启动定时轮询
    }

    private initWebSocket() {
        this.ws = new WebSocket(this.websocketURL);
        this.ws.onmessage = (event: MessageEvent) => {
            // console.log('onmessage', event.data);
            // 处理 ping 帧和 json 消息
            if (typeof event.data === 'string') {
                const text = event.data.trim();
                // 1. 处理 ping 帧
                if (text === 'ping') {
                    if (this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send('pong');
                    }
                    return;
                }
                // 2. 只尝试解析 json 格式
                if (text.startsWith('{') || text.startsWith('[')) {
                    try {
                        const data = JSON.parse(text);
                        // 只处理账户更新事件
                        if (data.e === 'ACCOUNT_UPDATE') {
                            this.mergeAccountUpdate(data);
                            this.accountUpdateCallbacks.forEach(cb => cb(this.accountSnapshot));
                        }
                        // 处理订单推送
                        if (data.e === 'ORDER_TRADE_UPDATE') {
                            this.formatOrderUpdate(data.o, data);
                        }
                        // 处理深度推送
                        if (data.e === 'depthUpdate') {
                            this.lastDepthData = data;
                            const formatted = this.formatDepthData(data);
                            this.depthUpdateCallbacks.forEach(cb => cb(formatted));
                        }
                        // 处理ticker推送
                        if (data.e === '24hrMiniTicker') {
                            const formatted = this.formatTickerData(data);
                            this.lastTickerData = formatted;
                            this.tickerUpdateCallbacks.forEach(cb => cb(formatted));
                        }
                        // 处理k线推送
                        if (data.e === 'kline') {
                            const k = this.formatWsKline(data.k);
                            // 合并到本地k线数组
                            const idx = this.lastKlines.findIndex(item => item.openTime === k.openTime);
                            if (idx !== -1) {
                                this.lastKlines[idx] = k;
                            } else {
                                this.lastKlines.push(k);
                                // 保持数组长度不变（如100）
                                if (this.lastKlines.length > 100) this.lastKlines.shift();
                            }
                            this.klineUpdateCallbacks.forEach(cb => cb(this.lastKlines));
                        }

                        // 🔥 处理 bookTicker 推送
                        if (data.e === 'bookTicker') {
                            this.lastBookTicker = {
                                symbol: data.s,
                                bidPrice: data.b,
                                bidQty: data.B,
                                askPrice: data.a,
                                askQty: data.A,
                                updateTime: data.E
                            };
                            this.bookTickerUpdateCallbacks.forEach(cb => cb(this.lastBookTicker));
                        }

                        // 🔥 处理 markPrice 推送
                        if (data.e === 'markPriceUpdate') {
                            this.lastMarkPrice = {
                                symbol: data.s,
                                markPrice: data.p,
                                indexPrice: data.i,
                                fundingRate: data.r,
                                nextFundingTime: data.T,
                                updateTime: data.E
                            };
                            this.markPriceUpdateCallbacks.forEach(cb => cb(this.lastMarkPrice));
                        }

                        // 🔥 处理聚合交易推送
                        if (data.e === 'aggTrade') {
                            const aggTrade = {
                                eventType: data.e,
                                eventTime: data.E,
                                symbol: data.s,
                                aggTradeId: data.a,
                                price: data.p,
                                quantity: data.q,
                                firstTradeId: data.f,
                                lastTradeId: data.l,
                                tradeTime: data.T,
                                isBuyerMaker: data.m
                            };
                            this.aggTradeUpdateCallbacks.forEach(cb => cb(aggTrade));
                        }
                    } catch (e) {
                        // 非法 json 忽略
                    }
                }
                // 其它非 json、非 ping 消息忽略
            }
        };
        // 连接成功后再订阅用户数据流和恢复所有订阅
        this.ws.onopen = async () => {
            try {
                await this.initAccountSnapshot();
                // 重新订阅所有普通频道
                for (const channel of this.subscribedChannels) {
                    this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });
                }
                // 重新订阅账户 listenKey 频道（需获取新 listenKey）
                await this.subscribeUserData();
                // 定时发送pong帧，防止被服务端断开
                this.pongIntervalId = setInterval(() => {
                    if (this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send('pong');
                    }
                }, 4 * 60 * 1000); // 每4分钟发一次
                // 定时延长 listenKey 有效期
                this.listenKeyKeepAliveIntervalId = setInterval(() => {
                    this.extendListenKey();
                }, 45 * 60 * 1000); // 每45分钟
            } catch (err) {
                console.error("WebSocket onopen 初始化失败:", err);
                // 关闭后自动重连
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.close();
                }
            }
        };
        this.ws.onclose = () => {
            if (this.pongIntervalId) {
                clearInterval(this.pongIntervalId);
                this.pongIntervalId = undefined;
            }
            if (this.listenKeyKeepAliveIntervalId) {
                clearInterval(this.listenKeyKeepAliveIntervalId);
                this.listenKeyKeepAliveIntervalId = undefined;
            }
            // 自动重连
            if (!this.reconnectTimeoutId) {
                this.reconnectTimeoutId = setTimeout(() => {
                    this.reconnectTimeoutId = undefined;
                    this.initWebSocket();
                }, 2000); // 2秒后重连
            }
        };
    }

    private async publicRequest(path: string, method: string, params: any) {
        const url = `${this.baseURL}${path}`;
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            return data;
        } catch (err) {
            console.error("publicRequest 网络请求失败:", err);
            throw err;
        }
    }

    private generateSignature(params: any) {
        // 1. 参数按key排序
        const ordered = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
        // 2. HMAC SHA256签名
        return crypto.createHmac('sha256', this.apiSecret).update(ordered).digest('hex');
    }

    private async signedRequest(path: string, method: string, params: any) {
        // 1. 添加timestamp和recvWindow
        const timestamp = Date.now();
        const recvWindow = params.recvWindow || 5000;
        const fullParams = { ...params, timestamp, recvWindow };
        // 2. 生成签名
        const signature = this.generateSignature(fullParams);
        // 3. 拼接参数字符串
        const paramStr = Object.keys(fullParams).sort().map(key => `${key}=${fullParams[key]}`).join('&');
        let url = `${this.baseURL}${path}`;
        const fetchOptions: any = {
            method,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-MBX-APIKEY': this.apiKey,
            }
        };
        if (method === 'GET') {
            url = `${url}?${paramStr}&signature=${signature}`;
        } else {
            fetchOptions.body = `${paramStr}&signature=${signature}`;
        }
        try {
            const response = await fetch(url, fetchOptions);
            const data = await response.json();
            return data;
        } catch (err) {
            console.error("signedRequest 网络请求失败:", err);
            throw err;
        }
    }

    public async ping() {
        const data = await this.publicRequest('/fapi/v1/ping', 'GET', {});
        return data;
    }

    public async time() {
        const data = await this.publicRequest('/fapi/v1/time', 'GET', {});
        return data;
    }

    public async getExchangeInfo() {
        const data = await this.publicRequest('/fapi/v1/exchangeInfo', 'GET', {});
        return data;
    }

    public async getDepth(symbol: string, limit: DepthLimit = 5) {
        const data = await this.publicRequest(`/fapi/v1/depth?symbol=${symbol}&limit=${limit}`, 'GET', {});
        return data;
    }

    public async getRecentTrades(symbol: string, limit: number = 500) {
        const data = await this.publicRequest(`/fapi/v1/trades?symbol=${symbol}&limit=${limit}`, 'GET', {});
        return data;
    }

    public async getHistoricalTrades(symbol: string, limit: number = 500) {
        const data = await this.publicRequest(`/fapi/v1/historicalTrades?symbol=${symbol}&limit=${limit}`, 'GET', {});
        return data;
    }

    public async getAggregatedTrades(params: {
        symbol: string;
        fromId?: number;
        startTime?: number;
        endTime?: number;
        limit?: number;
    }) {
        const data = await this.publicRequest(`/fapi/v1/aggTrades?symbol=${params.symbol}&fromId=${params.fromId}&startTime=${params.startTime}&endTime=${params.endTime}&limit=${params.limit}`, 'GET', {});
        return data;
    }

    public async getKlines(params: KlineParams) {
        const data = await this.publicRequest(`/fapi/v1/klines?symbol=${params.symbol}&interval=${params.interval}&startTime=${params.startTime}&endTime=${params.endTime}&limit=${params.limit}`, 'GET', {});
        return data;
    }

    public async getIndexPriceKlines(params: KlineParams) {
        const data = await this.publicRequest(`/fapi/v1/indexPriceKlines?symbol=${params.symbol}&interval=${params.interval}&startTime=${params.startTime}&endTime=${params.endTime}&limit=${params.limit}`, 'GET', {});
        return data;
    }

    public async getMarkPriceKlines(params: KlineParams) {
        const data = await this.publicRequest(`/fapi/v1/markPriceKlines?symbol=${params.symbol}&interval=${params.interval}&startTime=${params.startTime}&endTime=${params.endTime}&limit=${params.limit}`, 'GET', {});
        return data;
    }

    public async getPremiumIndexPrice(symbol: string) {
        const data = await this.publicRequest(`/fapi/v1/premiumIndexPrice?symbol=${symbol}`, 'GET', {});
        return data;
    }

    public async getFundingRate(params: {
        symbol: string;
        startTime?: number;
        endTime?: number;
        limit?: number;
    }) {
        const data = await this.publicRequest(`/fapi/v1/fundingRate?symbol=${params.symbol}&startTime=${params.startTime}&endTime=${params.endTime}&limit=${params.limit}`, 'GET', {});
        return data;
    }

    public async getTicker(symbol: string) {
        const data = await this.publicRequest(`/fapi/v1/ticker/24hr?symbol=${symbol}`, 'GET', {});
        return data;
    }

    public async getTickerPrice(symbol: string) {
        const data = await this.publicRequest(`/fapi/v1/ticker/price?symbol=${symbol}`, 'GET', {});
        return data;
    }

    public async getTickerBookTicker(symbol: string) {
        const data = await this.publicRequest(`/fapi/v1/ticker/bookTicker?symbol=${symbol}`, 'GET', {});
        return data;
    }

    /**
     * WebSocket
     */

    public async subscribe(params: SubscribeParams) {
        const channel = params.params[0];
        // 账户频道不加入普通集合
        if (!this.listenKeyChannel || channel !== this.listenKeyChannel) {
            this.subscribedChannels.add(channel);
        }
        const msg = JSON.stringify({ ...params, method: 'SUBSCRIBE' });
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(msg);
        } else {
            this.ws.addEventListener('open', () => {
                this.ws.send(msg);
            }, { once: true });
        }
    }

    public async unsubscribe(params: SubscribeParams) {
        const channel = params.params[0];
        if (this.subscribedChannels.has(channel)) {
            this.subscribedChannels.delete(channel);
        }
        const msg = JSON.stringify({ ...params, method: 'UNSUBSCRIBE' });
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(msg);
        } else {
            this.ws.addEventListener('open', () => {
                this.ws.send(msg);
            }, { once: true });
        }
    }

    public async close() {
        this.ws.close();
        if (this.pongIntervalId) {
            clearInterval(this.pongIntervalId);
            this.pongIntervalId = undefined;
        }
        if (this.listenKeyKeepAliveIntervalId) {
            clearInterval(this.listenKeyKeepAliveIntervalId);
            this.listenKeyKeepAliveIntervalId = undefined;
        }
        this.stopPolling(); // 停止定时轮询
    }

    public async subscribeAggregatedTrade(symbol: string) {
        this.subscribe({ params: [`${symbol}@aggTrade`], id: 1 });
    }

    public async subscribeMarkPrice(symbol: string) {
        this.subscribe({ params: [`${symbol}@markPrice`], id: 2 });
    }

    public async subscribeKline(symbol: string, interval: string) {
        this.subscribe({ params: [`${symbol}@kline_${interval}`], id: 3 });
    }

    public async subscribeMiniTicker(symbol: string) {
        this.subscribe({ params: [`${symbol}@miniTicker`], id: 4 });
    }

    public async subscribeAllMarketMiniTicker() {
        this.subscribe({ params: [`!miniTicker@arr`], id: 5 });
    }

    public async subscribeTicker(symbol: string) {
        this.subscribe({ params: [`${symbol}@ticker`], id: 6 });
    }

    public async subscribeAllMarketTicker() {
        this.subscribe({ params: [`!ticker@arr`], id: 7 });
    }

    public async subscribeBookTicker(symbol: string) {
        this.subscribe({ params: [`${symbol}@bookTicker`], id: 8 });
    }

    public async subscribeAllMarketBookTicker() {
        this.subscribe({ params: [`!bookTicker`], id: 9 });
    }

    public async subscribeForceOrder(symbol: string) {
        this.subscribe({ params: [`${symbol}@forceOrder`], id: 10 });
    }

    public async subscribeDepth(symbol: string, levels: number) {
        this.subscribe({ params: [`${symbol}@depth${levels}@100ms`], id: 11 });
    }

    public async postPositionSide(dualSidePosition: string) {
        const data = await this.signedRequest('/fapi/v1/positionSide/dual', 'POST', { dualSidePosition });
        return data;
    }

    public async getPositionSide() {
        const data = await this.signedRequest('/fapi/v1/positionSide/dual', 'GET', { });
        return data;
    }

    public async postMargin(multiAssetsMargin: "true" | "false") {
        const data = await this.signedRequest('/fapi/v1/margin/type', 'POST', { multiAssetsMargin });
        return data;
    }

    public async getMargin() {
        const data = await this.signedRequest('/fapi/v1/margin/type', 'GET', { });
        return data;
    }

    public async createOrder(params: CreateOrderParams) {
        const data = await this.signedRequest('/fapi/v1/order', 'POST', params);
        return data;
    }

    public async createTestOrder(params: CreateOrderParams) {
        const data = await this.signedRequest('/fapi/v1/order/test', 'POST', params);
        return data;
    }

    public async createOrders(params: {
        batchOrders: CreateOrderParams[];
    }) {
        const data = await this.signedRequest('/fapi/v1/batchOrders', 'POST', params);
        return data;
    }

    public async getOrder(params: {
        symbol: string;
        orderId?: number;
        origClientOrderId?: string;
    }) {
        const data = await this.signedRequest('/fapi/v1/order', 'GET', params);
        return data;
    }

    public async cancelOrder(params: {
        symbol: string;
        orderId?: number;
        origClientOrderId?: string;
    }) {
        const data = await this.signedRequest('/fapi/v1/order', 'DELETE', params);
        return data;
    }

    public async cancelOrders(params: {
        symbol: string;
        orderIdList?: number[];
        origClientOrderIdList?: string[];
    }) {
        const data = await this.signedRequest('/fapi/v1/batchOrders', 'DELETE', params);
        return data;
    }

    public async cancelAllOrders(params: {
        symbol: string;
    }) {
        const data = await this.signedRequest('/fapi/v1/allOpenOrders', 'DELETE', params);
        return data;
    }

    public async countdownCancelAllOrders(params: {
        symbol: string;
        countdownTime: number;
    }) {
        const data = await this.signedRequest('/fapi/v1/countdownCancelAll', 'POST', params);
        return data;
    }

    public async getOpenOrder(params: {
        symbol: string;
        orderId?: number;
        origClientOrderId?: string; 
    }) {
        const data = await this.signedRequest('/fapi/v1/openOrder', 'GET', params);
        return data;
    }

    public async getOpenOrders(params: {
        symbol?: string;
    }) {
        const data = await this.signedRequest('/fapi/v1/openOrders', 'GET', params);
        return data;
    }

    public async getAllOrders(params: {
        symbol?: string;
        orderId?: number;
        startTime?: number;
        endTime?: number;
        limit?: number;
    }) {
        const data = await this.signedRequest('/fapi/v1/allOrders', 'GET', params);
        return data;
    }

    public async getBalance() {
        const data = await this.signedRequest('/fapi/v2/balance', 'GET', { });
        return data;
    }

    public async getAccount() {
        const data = await this.signedRequest('/fapi/v2/account', 'GET', { });
        return data;
    }

    public async setLeverage(params: {
        symbol: string;
        leverage: number;
    }) {
        const data = await this.signedRequest('/fapi/v1/leverage', 'POST', params);
        return data;
    }

    public async setMarginType(params: {
        symbol: string;
        marginType: MarginType;
    }) {
        const data = await this.signedRequest('/fapi/v1/marginType', 'POST', params);
        return data;
    }

    public async setPositionMargin(params: {
        symbol: string;
        positionSide?: PositionSide;
        amount: number;
        type: 1 | 2;
    }) {
        const data = await this.signedRequest('/fapi/v1/positionMargin', 'POST', params);
        return data;
    }

    public async getPositionMarginHistory(params: {
        symbol: string;
        type: 1 | 2;
        startTime?: number;
        endTime?: number;
        limit?: number;
    }) {
        const data = await this.signedRequest('/fapi/v1/positionMargin/history', 'GET', params);
        return data;
    }

    public async getPositionRisk(params:{
        symbol?: string;
    }) {
        const data = await this.signedRequest('/fapi/v2/positionRisk', 'GET', params);
        return data;
    }

    public async getUserTrades(params: {
        symbol?: string;
        startTime?: number;
        endTime?: number;
        fromId?: number;
        limit?: number;
    }) {
        const data = await this.signedRequest('/fapi/v1/userTrades', 'GET', params);
        return data;
    }

    public async getIncome(params: {
        symbol?: string;
        incomeType?: string;
        startTime?: number;
        endTime?: number;
        limit?: number;
    }) {
        const data = await this.signedRequest('/fapi/v1/income', 'GET', params);
        return data;
    }

    public async getLeverageBracket(symbol?: string) {
        const data = await this.signedRequest('/fapi/v1/leverageBracket', 'GET', { symbol });
        return data;
    }

    public async getAdlQuantile(symbol?: string) {
        const data = await this.signedRequest('/fapi/v1/adlQuantile', 'GET', { symbol });
        return data;
    }

    public async getForceOrders(params: {
        symbol?: string;
        autoCloseType: "LIQUIDATION" | "ADL";
        startTime?: number;
        endTime?: number;
        limit?: number;
    }) {
        const data = await this.signedRequest('/fapi/v1/forceOrders', 'GET', params);
        return data;
    }

    public async getCommissionRate(symbol: string) {
        const data = await this.signedRequest('/fapi/v1/commissionRate', 'GET', { symbol });
        return data;
    }

    private async generateListenKey() {
        const data = await this.signedRequest('/fapi/v1/listenKey', 'POST', { });
        return data;
    }

    private async extendListenKey() {
        const data = await this.signedRequest('/fapi/v1/listenKey', 'PUT', { });
        return data;
    }

    private async closeListenKey() {
        const data = await this.signedRequest('/fapi/v1/listenKey', 'DELETE', {  });
        return data;
    }

    public async subscribeUserData() {
        const { listenKey } = await this.generateListenKey();
        this.listenKeyChannel = listenKey;
        this.subscribe({ params: [listenKey], id: 99 });
    }

    // 初始化账户快照
    private async initAccountSnapshot(retry = 0) {
        try {
            const account = await this.getAccount();
            this.accountSnapshot = account;
            // 初始化挂单快照
            const openOrders = await this.getOpenOrders({ symbol: this.defaultMarket });
            this.openOrders.clear();
            for (const order of openOrders) {
                this.openOrders.set(order.orderId, order);
            }
        } catch (err) {
            console.error("initAccountSnapshot 失败，准备重试:", err);
            if (retry < 5) {
                setTimeout(() => this.initAccountSnapshot(retry + 1), 2000 * (retry + 1));
            } else {
                // 超过最大重试次数，2秒后重连WebSocket
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.close();
                }
            }
        }
    }

    // 合并 ws 推送到本地账户快照
    private mergeAccountUpdate(update: any) {
        if (!this.accountSnapshot) return;
        // 合并资产
        if (update.a && Array.isArray(update.a.B)) {
            for (const b of update.a.B) {
                const asset = this.accountSnapshot.assets.find((a: any) => a.asset === b.a);
                if (asset) {
                    asset.walletBalance = b.wb;
                    asset.crossWalletBalance = b.cw;
                    // ws推送没有unrealizedProfit、marginBalance等字段，保留原有
                    // 可选：如有bc字段可自定义处理
                }
            }
        }
        // 合并持仓
        if (update.a && Array.isArray(update.a.P)) {
            for (const p of update.a.P) {
                const pos = this.accountSnapshot.positions.find(
                    (x: any) => x.symbol === p.s && x.positionSide === p.ps
                );
                if (pos) {
                    pos.positionAmt = p.pa;
                    pos.entryPrice = p.ep;
                    pos.unrealizedProfit = p.up;
                    pos.updateTime = update.E;
                    // ws推送专有字段
                    pos.cr = p.cr;
                    pos.mt = p.mt;
                    pos.iw = p.iw;
                }
            }
        }
    }

    /**
     * 注册账户和仓位实时推送回调
     * @param cb 回调函数，参数为账户结构化快照
     */
    public watchAccount(cb: (data: any) => void) {
        this.accountUpdateCallbacks.push(cb);
        // 注册时立即推送一次快照（如果已初始化），否则等待初始化后推送
        if (this.accountSnapshot) {
            cb(this.accountSnapshot);
        } else {
            // 等待初始化完成后推送一次
            const interval = setInterval(() => {
                if (this.accountSnapshot) {
                    cb(this.accountSnapshot);
                    clearInterval(interval);
                }
            }, 200);
        }
    }

    /**
     * 注册订单推送回调，返回格式化后的订单结构
     */
    public watchOrder(cb: (data: any) => void) {
        this.orderUpdateCallbacks.push(cb);
        // 注册时立即推送一次当前挂单列表（如果已初始化），否则等待初始化后推送
        if (this.openOrders.size > 0) {
            cb(Array.from(this.openOrders.values()));
        } else {
            const interval = setInterval(() => {
                if (this.openOrders.size > 0) {
                    cb(Array.from(this.openOrders.values()));
                    clearInterval(interval);
                }
            }, 200);
        }
    }

    // 格式化订单推送为 http 查询订单结构，并维护 openOrders
    private formatOrderUpdate(o: any, event?: any): void {
        const order: AsterOrder = {
            avgPrice: o.ap ?? o.avgPrice ?? "0",
            clientOrderId: o.c ?? o.clientOrderId ?? '',
            cumQuote: o.z ?? o.cumQuote ?? "0",
            executedQty: o.z ?? o.executedQty ?? "0",
            orderId: o.i ?? o.orderId,
            origQty: o.q ?? o.origQty ?? "0",
            origType: o.ot ?? o.origType ?? '',
            price: o.p ?? o.price ?? "0",
            reduceOnly: o.R ?? o.reduceOnly ?? false,
            side: o.S ?? o.side ?? '',
            positionSide: o.ps ?? o.positionSide ?? '',
            status: o.X ?? o.status ?? '',
            stopPrice: o.sp ?? o.stopPrice ?? '',
            closePosition: o.cp ?? o.closePosition ?? false,
            symbol: o.s ?? o.symbol ?? '',
            time: o.T ?? o.time ?? 0,
            timeInForce: o.f ?? o.timeInForce ?? '',
            type: o.o ?? o.type ?? '',
            activatePrice: o.AP ?? o.activatePrice,
            priceRate: o.cr ?? o.priceRate,
            updateTime: o.T ?? o.updateTime ?? 0,
            workingType: o.wt ?? o.workingType ?? '',
            priceProtect: o.PP ?? o.priceProtect ?? false,

            // ws推送专有
            eventType: event?.e,
            eventTime: event?.E,
            matchTime: event?.T,
            lastFilledQty: o.l,
            lastFilledPrice: o.L,
            commissionAsset: o.N,
            commission: o.n,
            tradeId: o.t,
            bidValue: o.b,
            askValue: o.a,
            isMaker: o.m,
            wt: o.wt,
            ot: o.ot,
            cp: o.cp,
            rp: o.rp
        };
        // 维护 openOrders
        if (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED') {
            this.openOrders.set(order.orderId, order);
        } else {
            // 市价单特殊处理：至少推送一次后再删除
            const prev = this.openOrders.get(order.orderId);
            if (order.type === 'MARKET') {
                if (!prev || !prev._pushedOnce) {
                    // 第一次推送，做标记，不删
                    order._pushedOnce = true;
                    this.openOrders.set(order.orderId, order);
                } else {
                    // 已推送过一次，删除
                    this.openOrders.delete(order.orderId);
                }
            } else {
                this.openOrders.delete(order.orderId);
            }
        }
        // 主动清理所有已推送过的市价单
        for (const [id, o] of this.openOrders) {
            if (o.type === 'MARKET' && o._pushedOnce) {
                this.openOrders.delete(id);
            }
        }
        // 推送最新挂单列表
        this.orderUpdateCallbacks.forEach(cb => cb(Array.from(this.openOrders.values())));
    }

    /**
     * 订阅并推送 symbol 的5档深度信息
     */
    public watchDepth(symbol: string, cb: (data: any) => void) {
        const channel = `${symbol.toLowerCase()}@depth5@100ms`;
        this.depthUpdateCallbacks.push(cb);
        this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });
        // 注册时如果已有快照则立即推送
        if (this.lastDepthData && this.lastDepthData.s === symbol.toUpperCase()) {
            cb(this.formatDepthData(this.lastDepthData));
        }
    }

    // 格式化深度推送为标准结构
    private formatDepthData(data: any): AsterDepth {
        return {
            eventType: data.e,
            eventTime: data.E,
            tradeTime: data.T,
            symbol: data.s,
            firstUpdateId: data.U,
            lastUpdateId: data.u ?? data.lastUpdateId,
            prevUpdateId: data.pu,
            bids: data.b ?? data.bids ?? [],
            asks: data.a ?? data.asks ?? []
        };
    }

    /**
     * 订阅并推送 symbol 的ticker信息
     */
    public async watchTicker(symbol?: string, cb?: (data: any) => void) {
        const useSymbol = (symbol || this.defaultMarket).toUpperCase();
        const channel = `${useSymbol.toLowerCase()}@miniTicker`;
        if (cb) this.tickerUpdateCallbacks.push(cb);
        this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });
        // 初始化时从 http 获取一次 ticker
        if (!this.lastTickerData || this.lastTickerData.symbol !== useSymbol) {
            const ticker = await this.getTicker(useSymbol);
            this.lastTickerData = ticker;
        }
        // 注册时立即推送
        if (cb) {
            if (this.lastTickerData && this.lastTickerData.symbol === useSymbol) {
                cb(this.lastTickerData);
            } else {
                const interval = setInterval(() => {
                    if (this.lastTickerData && this.lastTickerData.symbol === useSymbol) {
                        cb(this.lastTickerData);
                        clearInterval(interval);
                    }
                }, 200);
            }
        }
    }

    // 格式化ticker推送为标准结构
    private formatTickerData(data: any): AsterTicker {
        // ws推送
        if (data.e === '24hrMiniTicker') {
            return {
                symbol: data.s,
                lastPrice: data.c,
                openPrice: data.o,
                highPrice: data.h,
                lowPrice: data.l,
                volume: data.v,
                quoteVolume: data.q,
                eventType: data.e,
                eventTime: data.E
            };
        }
        // http
        return {
            symbol: data.symbol,
            lastPrice: data.lastPrice,
            openPrice: data.openPrice,
            highPrice: data.highPrice,
            lowPrice: data.lowPrice,
            volume: data.volume,
            quoteVolume: data.quoteVolume,
            priceChange: data.priceChange,
            priceChangePercent: data.priceChangePercent,
            weightedAvgPrice: data.weightedAvgPrice,
            lastQty: data.lastQty,
            openTime: data.openTime,
            closeTime: data.closeTime,
            firstId: data.firstId,
            lastId: data.lastId,
            count: data.count
        };
    }

    /**
     * 订阅并推送 symbol+interval 的k线数据
     */
    public async watchKline(symbol: string, interval: string, cb: (data: any[]) => void) {
        this.klineSymbol = symbol.toUpperCase();
        this.klineInterval = interval;
        this.klineUpdateCallbacks.push(cb);
        // 先从 http 获取一次历史k线
        if (!this.lastKlines.length) {
            const klines = await this.getKlines({ symbol: this.klineSymbol, interval: this.klineInterval, limit: 100 });
            this.lastKlines = klines.map(this.formatKlineArray);
        }
        // 订阅 ws kline 频道
        const channel = `${symbol.toLowerCase()}@kline_${interval}`;
        this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });
        // 注册时立即推送
        if (this.lastKlines.length) {
            cb(this.lastKlines);
        } else {
            const intervalId = setInterval(() => {
                if (this.lastKlines.length) {
                    cb(this.lastKlines);
                    clearInterval(intervalId);
                }
            }, 200);
        }
    }

    // 🔥 订阅并推送 BookTicker（最优挂单价格）
    public watchBookTicker(symbol: string, cb: (data: any) => void) {
        this.bookTickerUpdateCallbacks.push(cb);
        const channel = `${symbol.toLowerCase()}@bookTicker`;
        this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });

        // 如果已有缓存数据，立即推送
        if (this.lastBookTicker && this.lastBookTicker.symbol === symbol) {
            cb(this.lastBookTicker);
        }
    }

    // 🔥 订阅并推送 MarkPrice（标记价格）
    public watchMarkPrice(symbol: string, cb: (data: any) => void) {
        this.markPriceUpdateCallbacks.push(cb);
        const channel = `${symbol.toLowerCase()}@markPrice`;
        this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });

        // 如果已有缓存数据，立即推送
        if (this.lastMarkPrice && this.lastMarkPrice.symbol === symbol) {
            cb(this.lastMarkPrice);
        }
    }

    // 🔥 订阅并推送聚合交易流（Aggregated Trades）
    public watchAggTrade(symbol: string, cb: (data: any) => void) {
        this.aggTradeUpdateCallbacks.push(cb);
        this.subscribeAggregatedTrade(symbol);
    }

    // 格式化 http k线数组
    private formatKlineArray(arr: any[]): AsterKline {
        return {
            openTime: arr[0],
            open: arr[1],
            high: arr[2],
            low: arr[3],
            close: arr[4],
            volume: arr[5],
            closeTime: arr[6],
            quoteAssetVolume: arr[7],
            numberOfTrades: arr[8],
            takerBuyBaseAssetVolume: arr[9],
            takerBuyQuoteAssetVolume: arr[10]
        };
    }

    // 格式化 ws kline
    private formatWsKline(k: any, event?: any): AsterKline {
        return {
            openTime: k.t,
            open: k.o,
            high: k.h,
            low: k.l,
            close: k.c,
            volume: k.v,
            closeTime: k.T,
            quoteAssetVolume: k.q,
            numberOfTrades: k.n,
            takerBuyBaseAssetVolume: k.V,
            takerBuyQuoteAssetVolume: k.Q,
            eventType: event?.e,
            eventTime: event?.E,
            symbol: k.s ?? event?.s,
            interval: k.i,
            firstTradeId: k.f,
            lastTradeId: k.L,
            isClosed: k.x
        };
    }

    private startPolling() {
        this.pollingIntervalId = setInterval(async () => {
            try {
                // 1. 轮询账户信息
                const account = await this.getAccount();
                if (this.accountSnapshot) {
                    // 直接用新数据的所有字段替换原有内容（无缝覆盖，不clear对象）
                    Object.keys(account).forEach(key => {
                        this.accountSnapshot[key] = account[key];
                    });
                } else {
                    this.accountSnapshot = account;
                }
                this.accountUpdateCallbacks.forEach(cb => cb(this.accountSnapshot));

                // 2. 轮询挂单信息
                const openOrdersResponse = await this.getOpenOrders({ symbol: this.defaultMarket });
                const openOrders = Array.isArray(openOrdersResponse) ? openOrdersResponse : [];
                // 不clear，直接用新数据替换Map内容
                // 先删除Map中已不在新列表的订单
                const newOrderIds = new Set(openOrders.map((o: any) => o.orderId));
                for (const id of Array.from(this.openOrders.keys())) {
                    if (!newOrderIds.has(id)) {
                        this.openOrders.delete(id);
                    }
                }
                // 再更新和新增
                for (const order of openOrders) {
                    this.openOrders.set(order.orderId, order);
                }
                this.orderUpdateCallbacks.forEach(cb => cb(Array.from(this.openOrders.values())));
            } catch (err) {
                console.error("定时轮询失败:", err);
            }
        }, 10000); // 每10秒
    }

    private stopPolling() {
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = undefined;
        }
    }
}