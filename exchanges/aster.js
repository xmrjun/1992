"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Aster = void 0;
var crypto_1 = require("crypto");
var ws_1 = require("ws");
// WebSocket polyfill for Node.js
globalThis.WebSocket = ws_1.default;
var Aster = /** @class */ (function () {
    function Aster(apiKey, apiSecret, defaultMarket) {
        if (defaultMarket === void 0) { defaultMarket = 'BTCUSDT'; }
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.accountUpdateCallbacks = [];
        this.accountSnapshot = null;
        this.orderUpdateCallbacks = [];
        this.subscribedChannels = new Set();
        this.listenKeyChannel = null;
        this.openOrders = new Map();
        this.depthUpdateCallbacks = [];
        this.lastDepthData = null;
        this.tickerUpdateCallbacks = [];
        this.lastTickerData = null;
        this.klineUpdateCallbacks = [];
        this.lastKlines = [];
        this.klineSymbol = '';
        this.klineInterval = '';
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseURL = 'https://fapi.asterdex.com';
        this.websocketURL = 'wss://fstream.asterdex.com/ws';
        this.defaultMarket = defaultMarket;
        this.initWebSocket();
        this.startPolling(); // 启动定时轮询
    }
    Aster.prototype.initWebSocket = function () {
        var _this = this;
        this.ws = new ws_1.default(this.websocketURL);
        this.ws.onmessage = function (event) {
            // console.log('onmessage', event.data);
            // 处理 ping 帧和 json 消息
            if (typeof event.data === 'string') {
                var text = event.data.trim();
                // 1. 处理 ping 帧
                if (text === 'ping') {
                    if (_this.ws.readyState === ws_1.default.OPEN) {
                        _this.ws.send('pong');
                    }
                    return;
                }
                // 2. 只尝试解析 json 格式
                if (text.startsWith('{') || text.startsWith('[')) {
                    try {
                        var data = JSON.parse(text);
                        // 只处理账户更新事件
                        if (data.e === 'ACCOUNT_UPDATE') {
                            _this.mergeAccountUpdate(data);
                            _this.accountUpdateCallbacks.forEach(function (cb) { return cb(_this.accountSnapshot); });
                        }
                        // 处理订单推送
                        if (data.e === 'ORDER_TRADE_UPDATE') {
                            _this.formatOrderUpdate(data.o, data);
                        }
                        // 处理深度推送
                        if (data.e === 'depthUpdate') {
                            _this.lastDepthData = data;
                            var formatted_1 = _this.formatDepthData(data);
                            _this.depthUpdateCallbacks.forEach(function (cb) { return cb(formatted_1); });
                        }
                        // 处理ticker推送
                        if (data.e === '24hrMiniTicker') {
                            var formatted_2 = _this.formatTickerData(data);
                            _this.lastTickerData = formatted_2;
                            _this.tickerUpdateCallbacks.forEach(function (cb) { return cb(formatted_2); });
                        }
                        // 处理k线推送
                        if (data.e === 'kline') {
                            var k_1 = _this.formatWsKline(data.k);
                            // 合并到本地k线数组
                            var idx = _this.lastKlines.findIndex(function (item) { return item.openTime === k_1.openTime; });
                            if (idx !== -1) {
                                _this.lastKlines[idx] = k_1;
                            }
                            else {
                                _this.lastKlines.push(k_1);
                                // 保持数组长度不变（如100）
                                if (_this.lastKlines.length > 100)
                                    _this.lastKlines.shift();
                            }
                            _this.klineUpdateCallbacks.forEach(function (cb) { return cb(_this.lastKlines); });
                        }
                    }
                    catch (e) {
                        // 非法 json 忽略
                    }
                }
                // 其它非 json、非 ping 消息忽略
            }
        };
        // 连接成功后再订阅用户数据流和恢复所有订阅
        this.ws.onopen = function () { return __awaiter(_this, void 0, void 0, function () {
            var _i, _a, channel, err_1;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.initAccountSnapshot()];
                    case 1:
                        _b.sent();
                        // 重新订阅所有普通频道
                        for (_i = 0, _a = this.subscribedChannels; _i < _a.length; _i++) {
                            channel = _a[_i];
                            this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });
                        }
                        // 重新订阅账户 listenKey 频道（需获取新 listenKey）
                        return [4 /*yield*/, this.subscribeUserData()];
                    case 2:
                        // 重新订阅账户 listenKey 频道（需获取新 listenKey）
                        _b.sent();
                        // 定时发送pong帧，防止被服务端断开
                        this.pongIntervalId = setInterval(function () {
                            if (_this.ws.readyState === ws_1.default.OPEN) {
                                _this.ws.send('pong');
                            }
                        }, 4 * 60 * 1000); // 每4分钟发一次
                        // 定时延长 listenKey 有效期
                        this.listenKeyKeepAliveIntervalId = setInterval(function () {
                            _this.extendListenKey();
                        }, 45 * 60 * 1000); // 每45分钟
                        return [3 /*break*/, 4];
                    case 3:
                        err_1 = _b.sent();
                        console.error("WebSocket onopen 初始化失败:", err_1);
                        // 关闭后自动重连
                        if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
                            this.ws.close();
                        }
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        this.ws.onclose = function () {
            if (_this.pongIntervalId) {
                clearInterval(_this.pongIntervalId);
                _this.pongIntervalId = undefined;
            }
            if (_this.listenKeyKeepAliveIntervalId) {
                clearInterval(_this.listenKeyKeepAliveIntervalId);
                _this.listenKeyKeepAliveIntervalId = undefined;
            }
            // 自动重连
            if (!_this.reconnectTimeoutId) {
                _this.reconnectTimeoutId = setTimeout(function () {
                    _this.reconnectTimeoutId = undefined;
                    _this.initWebSocket();
                }, 2000); // 2秒后重连
            }
        };
    };
    Aster.prototype.publicRequest = function (path, method, params) {
        return __awaiter(this, void 0, void 0, function () {
            var url, response, data, err_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.baseURL).concat(path);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, {
                                method: method,
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                            })];
                    case 2:
                        response = _a.sent();
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data];
                    case 4:
                        err_2 = _a.sent();
                        console.error("publicRequest 网络请求失败:", err_2);
                        throw err_2;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    Aster.prototype.generateSignature = function (params) {
        // 1. 参数按key排序
        var ordered = Object.keys(params).sort().map(function (key) { return "".concat(key, "=").concat(params[key]); }).join('&');
        // 2. HMAC SHA256签名
        return crypto_1.default.createHmac('sha256', this.apiSecret).update(ordered).digest('hex');
    };
    Aster.prototype.signedRequest = function (path, method, params) {
        return __awaiter(this, void 0, void 0, function () {
            var timestamp, recvWindow, fullParams, signature, paramStr, url, fetchOptions, response, data, err_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        timestamp = Date.now();
                        recvWindow = params.recvWindow || 5000;
                        fullParams = __assign(__assign({}, params), { timestamp: timestamp, recvWindow: recvWindow });
                        signature = this.generateSignature(fullParams);
                        paramStr = Object.keys(fullParams).sort().map(function (key) { return "".concat(key, "=").concat(fullParams[key]); }).join('&');
                        url = "".concat(this.baseURL).concat(path);
                        fetchOptions = {
                            method: method,
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'X-MBX-APIKEY': this.apiKey,
                            }
                        };
                        if (method === 'GET') {
                            url = "".concat(url, "?").concat(paramStr, "&signature=").concat(signature);
                        }
                        else {
                            fetchOptions.body = "".concat(paramStr, "&signature=").concat(signature);
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, fetch(url, fetchOptions)];
                    case 2:
                        response = _a.sent();
                        return [4 /*yield*/, response.json()];
                    case 3:
                        data = _a.sent();
                        return [2 /*return*/, data];
                    case 4:
                        err_3 = _a.sent();
                        console.error("signedRequest 网络请求失败:", err_3);
                        throw err_3;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    Aster.prototype.ping = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest('/fapi/v1/ping', 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.time = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest('/fapi/v1/time', 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getExchangeInfo = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest('/fapi/v1/exchangeInfo', 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getDepth = function (symbol_1) {
        return __awaiter(this, arguments, void 0, function (symbol, limit) {
            var data;
            if (limit === void 0) { limit = 5; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/depth?symbol=".concat(symbol, "&limit=").concat(limit), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getRecentTrades = function (symbol_1) {
        return __awaiter(this, arguments, void 0, function (symbol, limit) {
            var data;
            if (limit === void 0) { limit = 500; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/trades?symbol=".concat(symbol, "&limit=").concat(limit), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getHistoricalTrades = function (symbol_1) {
        return __awaiter(this, arguments, void 0, function (symbol, limit) {
            var data;
            if (limit === void 0) { limit = 500; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/historicalTrades?symbol=".concat(symbol, "&limit=").concat(limit), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getAggregatedTrades = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/aggTrades?symbol=".concat(params.symbol, "&fromId=").concat(params.fromId, "&startTime=").concat(params.startTime, "&endTime=").concat(params.endTime, "&limit=").concat(params.limit), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getKlines = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/klines?symbol=".concat(params.symbol, "&interval=").concat(params.interval, "&startTime=").concat(params.startTime, "&endTime=").concat(params.endTime, "&limit=").concat(params.limit), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getIndexPriceKlines = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/indexPriceKlines?symbol=".concat(params.symbol, "&interval=").concat(params.interval, "&startTime=").concat(params.startTime, "&endTime=").concat(params.endTime, "&limit=").concat(params.limit), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getMarkPriceKlines = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/markPriceKlines?symbol=".concat(params.symbol, "&interval=").concat(params.interval, "&startTime=").concat(params.startTime, "&endTime=").concat(params.endTime, "&limit=").concat(params.limit), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getPremiumIndexPrice = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/premiumIndexPrice?symbol=".concat(symbol), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getFundingRate = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/fundingRate?symbol=".concat(params.symbol, "&startTime=").concat(params.startTime, "&endTime=").concat(params.endTime, "&limit=").concat(params.limit), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getTicker = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/ticker/24hr?symbol=".concat(symbol), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getTickerPrice = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/ticker/price?symbol=".concat(symbol), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getTickerBookTicker = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.publicRequest("/fapi/v1/ticker/bookTicker?symbol=".concat(symbol), 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    /**
     * WebSocket
     */
    Aster.prototype.subscribe = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var channel, msg;
            var _this = this;
            return __generator(this, function (_a) {
                channel = params.params[0];
                // 账户频道不加入普通集合
                if (!this.listenKeyChannel || channel !== this.listenKeyChannel) {
                    this.subscribedChannels.add(channel);
                }
                msg = JSON.stringify(__assign(__assign({}, params), { method: 'SUBSCRIBE' }));
                if (this.ws.readyState === ws_1.default.OPEN) {
                    this.ws.send(msg);
                }
                else {
                    this.ws.addEventListener('open', function () {
                        _this.ws.send(msg);
                    }, { once: true });
                }
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.unsubscribe = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var channel, msg;
            var _this = this;
            return __generator(this, function (_a) {
                channel = params.params[0];
                if (this.subscribedChannels.has(channel)) {
                    this.subscribedChannels.delete(channel);
                }
                msg = JSON.stringify(__assign(__assign({}, params), { method: 'UNSUBSCRIBE' }));
                if (this.ws.readyState === ws_1.default.OPEN) {
                    this.ws.send(msg);
                }
                else {
                    this.ws.addEventListener('open', function () {
                        _this.ws.send(msg);
                    }, { once: true });
                }
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
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
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeAggregatedTrade = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["".concat(symbol, "@aggTrade")], id: 1 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeMarkPrice = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["".concat(symbol, "@markPrice")], id: 2 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeKline = function (symbol, interval) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["".concat(symbol, "@kline_").concat(interval)], id: 3 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeMiniTicker = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["".concat(symbol, "@miniTicker")], id: 4 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeAllMarketMiniTicker = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["!miniTicker@arr"], id: 5 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeTicker = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["".concat(symbol, "@ticker")], id: 6 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeAllMarketTicker = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["!ticker@arr"], id: 7 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeBookTicker = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["".concat(symbol, "@bookTicker")], id: 8 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeAllMarketBookTicker = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["!bookTicker"], id: 9 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeForceOrder = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["".concat(symbol, "@forceOrder")], id: 10 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.subscribeDepth = function (symbol, levels) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.subscribe({ params: ["".concat(symbol, "@depth").concat(levels, "@100ms")], id: 11 });
                return [2 /*return*/];
            });
        });
    };
    Aster.prototype.postPositionSide = function (dualSidePosition) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/positionSide/dual', 'POST', { dualSidePosition: dualSidePosition })];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getPositionSide = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/positionSide/dual', 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.postMargin = function (multiAssetsMargin) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/margin/type', 'POST', { multiAssetsMargin: multiAssetsMargin })];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getMargin = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/margin/type', 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.createOrder = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/order', 'POST', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.createTestOrder = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/order/test', 'POST', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.createOrders = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/batchOrders', 'POST', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getOrder = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/order', 'GET', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.cancelOrder = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/order', 'DELETE', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.cancelOrders = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/batchOrders', 'DELETE', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.cancelAllOrders = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/allOpenOrders', 'DELETE', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.countdownCancelAllOrders = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/countdownCancelAll', 'POST', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getOpenOrder = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/openOrder', 'GET', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getOpenOrders = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/openOrders', 'GET', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getAllOrders = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/allOrders', 'GET', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getBalance = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v2/balance', 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getAccount = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v2/account', 'GET', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.setLeverage = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/leverage', 'POST', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.setMarginType = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/marginType', 'POST', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.setPositionMargin = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/positionMargin', 'POST', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getPositionMarginHistory = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/positionMargin/history', 'GET', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getPositionRisk = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v2/positionRisk', 'GET', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getUserTrades = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/userTrades', 'GET', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getIncome = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/income', 'GET', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getLeverageBracket = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/leverageBracket', 'GET', { symbol: symbol })];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getAdlQuantile = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/adlQuantile', 'GET', { symbol: symbol })];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getForceOrders = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/forceOrders', 'GET', params)];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.getCommissionRate = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/commissionRate', 'GET', { symbol: symbol })];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.generateListenKey = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/listenKey', 'POST', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.extendListenKey = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/listenKey', 'PUT', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.closeListenKey = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.signedRequest('/fapi/v1/listenKey', 'DELETE', {})];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, data];
                }
            });
        });
    };
    Aster.prototype.subscribeUserData = function () {
        return __awaiter(this, void 0, void 0, function () {
            var listenKey;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.generateListenKey()];
                    case 1:
                        listenKey = (_a.sent()).listenKey;
                        this.listenKeyChannel = listenKey;
                        this.subscribe({ params: [listenKey], id: 99 });
                        return [2 /*return*/];
                }
            });
        });
    };
    // 初始化账户快照
    Aster.prototype.initAccountSnapshot = function () {
        return __awaiter(this, arguments, void 0, function (retry) {
            var account, openOrders, _i, openOrders_1, order, err_4;
            var _this = this;
            if (retry === void 0) { retry = 0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.getAccount()];
                    case 1:
                        account = _a.sent();
                        this.accountSnapshot = account;
                        return [4 /*yield*/, this.getOpenOrders({ symbol: this.defaultMarket })];
                    case 2:
                        openOrders = _a.sent();
                        this.openOrders.clear();
                        for (_i = 0, openOrders_1 = openOrders; _i < openOrders_1.length; _i++) {
                            order = openOrders_1[_i];
                            this.openOrders.set(order.orderId, order);
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        err_4 = _a.sent();
                        console.error("initAccountSnapshot 失败，准备重试:", err_4);
                        if (retry < 5) {
                            setTimeout(function () { return _this.initAccountSnapshot(retry + 1); }, 2000 * (retry + 1));
                        }
                        else {
                            // 超过最大重试次数，2秒后重连WebSocket
                            if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
                                this.ws.close();
                            }
                        }
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // 合并 ws 推送到本地账户快照
    Aster.prototype.mergeAccountUpdate = function (update) {
        if (!this.accountSnapshot)
            return;
        // 合并资产
        if (update.a && Array.isArray(update.a.B)) {
            var _loop_1 = function (b) {
                var asset = this_1.accountSnapshot.assets.find(function (a) { return a.asset === b.a; });
                if (asset) {
                    asset.walletBalance = b.wb;
                    asset.crossWalletBalance = b.cw;
                    // ws推送没有unrealizedProfit、marginBalance等字段，保留原有
                    // 可选：如有bc字段可自定义处理
                }
            };
            var this_1 = this;
            for (var _i = 0, _a = update.a.B; _i < _a.length; _i++) {
                var b = _a[_i];
                _loop_1(b);
            }
        }
        // 合并持仓
        if (update.a && Array.isArray(update.a.P)) {
            var _loop_2 = function (p) {
                var pos = this_2.accountSnapshot.positions.find(function (x) { return x.symbol === p.s && x.positionSide === p.ps; });
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
            };
            var this_2 = this;
            for (var _b = 0, _c = update.a.P; _b < _c.length; _b++) {
                var p = _c[_b];
                _loop_2(p);
            }
        }
    };
    /**
     * 注册账户和仓位实时推送回调
     * @param cb 回调函数，参数为账户结构化快照
     */
    Aster.prototype.watchAccount = function (cb) {
        var _this = this;
        this.accountUpdateCallbacks.push(cb);
        // 注册时立即推送一次快照（如果已初始化），否则等待初始化后推送
        if (this.accountSnapshot) {
            cb(this.accountSnapshot);
        }
        else {
            // 等待初始化完成后推送一次
            var interval_1 = setInterval(function () {
                if (_this.accountSnapshot) {
                    cb(_this.accountSnapshot);
                    clearInterval(interval_1);
                }
            }, 200);
        }
    };
    /**
     * 注册订单推送回调，返回格式化后的订单结构
     */
    Aster.prototype.watchOrder = function (cb) {
        var _this = this;
        this.orderUpdateCallbacks.push(cb);
        // 注册时立即推送一次当前挂单列表（如果已初始化），否则等待初始化后推送
        if (this.openOrders.size > 0) {
            cb(Array.from(this.openOrders.values()));
        }
        else {
            var interval_2 = setInterval(function () {
                if (_this.openOrders.size > 0) {
                    cb(Array.from(_this.openOrders.values()));
                    clearInterval(interval_2);
                }
            }, 200);
        }
    };
    // 格式化订单推送为 http 查询订单结构，并维护 openOrders
    Aster.prototype.formatOrderUpdate = function (o, event) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18;
        var order = {
            avgPrice: (_b = (_a = o.ap) !== null && _a !== void 0 ? _a : o.avgPrice) !== null && _b !== void 0 ? _b : "0",
            clientOrderId: (_d = (_c = o.c) !== null && _c !== void 0 ? _c : o.clientOrderId) !== null && _d !== void 0 ? _d : '',
            cumQuote: (_f = (_e = o.z) !== null && _e !== void 0 ? _e : o.cumQuote) !== null && _f !== void 0 ? _f : "0",
            executedQty: (_h = (_g = o.z) !== null && _g !== void 0 ? _g : o.executedQty) !== null && _h !== void 0 ? _h : "0",
            orderId: (_j = o.i) !== null && _j !== void 0 ? _j : o.orderId,
            origQty: (_l = (_k = o.q) !== null && _k !== void 0 ? _k : o.origQty) !== null && _l !== void 0 ? _l : "0",
            origType: (_o = (_m = o.ot) !== null && _m !== void 0 ? _m : o.origType) !== null && _o !== void 0 ? _o : '',
            price: (_q = (_p = o.p) !== null && _p !== void 0 ? _p : o.price) !== null && _q !== void 0 ? _q : "0",
            reduceOnly: (_s = (_r = o.R) !== null && _r !== void 0 ? _r : o.reduceOnly) !== null && _s !== void 0 ? _s : false,
            side: (_u = (_t = o.S) !== null && _t !== void 0 ? _t : o.side) !== null && _u !== void 0 ? _u : '',
            positionSide: (_w = (_v = o.ps) !== null && _v !== void 0 ? _v : o.positionSide) !== null && _w !== void 0 ? _w : '',
            status: (_y = (_x = o.X) !== null && _x !== void 0 ? _x : o.status) !== null && _y !== void 0 ? _y : '',
            stopPrice: (_0 = (_z = o.sp) !== null && _z !== void 0 ? _z : o.stopPrice) !== null && _0 !== void 0 ? _0 : '',
            closePosition: (_2 = (_1 = o.cp) !== null && _1 !== void 0 ? _1 : o.closePosition) !== null && _2 !== void 0 ? _2 : false,
            symbol: (_4 = (_3 = o.s) !== null && _3 !== void 0 ? _3 : o.symbol) !== null && _4 !== void 0 ? _4 : '',
            time: (_6 = (_5 = o.T) !== null && _5 !== void 0 ? _5 : o.time) !== null && _6 !== void 0 ? _6 : 0,
            timeInForce: (_8 = (_7 = o.f) !== null && _7 !== void 0 ? _7 : o.timeInForce) !== null && _8 !== void 0 ? _8 : '',
            type: (_10 = (_9 = o.o) !== null && _9 !== void 0 ? _9 : o.type) !== null && _10 !== void 0 ? _10 : '',
            activatePrice: (_11 = o.AP) !== null && _11 !== void 0 ? _11 : o.activatePrice,
            priceRate: (_12 = o.cr) !== null && _12 !== void 0 ? _12 : o.priceRate,
            updateTime: (_14 = (_13 = o.T) !== null && _13 !== void 0 ? _13 : o.updateTime) !== null && _14 !== void 0 ? _14 : 0,
            workingType: (_16 = (_15 = o.wt) !== null && _15 !== void 0 ? _15 : o.workingType) !== null && _16 !== void 0 ? _16 : '',
            priceProtect: (_18 = (_17 = o.PP) !== null && _17 !== void 0 ? _17 : o.priceProtect) !== null && _18 !== void 0 ? _18 : false,
            // ws推送专有
            eventType: event === null || event === void 0 ? void 0 : event.e,
            eventTime: event === null || event === void 0 ? void 0 : event.E,
            matchTime: event === null || event === void 0 ? void 0 : event.T,
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
        }
        else {
            // 市价单特殊处理：至少推送一次后再删除
            var prev = this.openOrders.get(order.orderId);
            if (order.type === 'MARKET') {
                if (!prev || !prev._pushedOnce) {
                    // 第一次推送，做标记，不删
                    order._pushedOnce = true;
                    this.openOrders.set(order.orderId, order);
                }
                else {
                    // 已推送过一次，删除
                    this.openOrders.delete(order.orderId);
                }
            }
            else {
                this.openOrders.delete(order.orderId);
            }
        }
        // 主动清理所有已推送过的市价单
        for (var _i = 0, _19 = this.openOrders; _i < _19.length; _i++) {
            var _20 = _19[_i], id = _20[0], o_1 = _20[1];
            if (o_1.type === 'MARKET' && o_1._pushedOnce) {
                this.openOrders.delete(id);
            }
        }
        // 推送最新挂单列表
        this.orderUpdateCallbacks.forEach(function (cb) { return cb(Array.from(_this.openOrders.values())); });
    };
    /**
     * 订阅并推送 symbol 的5档深度信息
     */
    Aster.prototype.watchDepth = function (symbol, cb) {
        var channel = "".concat(symbol.toLowerCase(), "@depth5@100ms");
        this.depthUpdateCallbacks.push(cb);
        this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });
        // 注册时如果已有快照则立即推送
        if (this.lastDepthData && this.lastDepthData.s === symbol.toUpperCase()) {
            cb(this.formatDepthData(this.lastDepthData));
        }
    };
    // 格式化深度推送为标准结构
    Aster.prototype.formatDepthData = function (data) {
        var _a, _b, _c, _d, _e;
        return {
            eventType: data.e,
            eventTime: data.E,
            tradeTime: data.T,
            symbol: data.s,
            firstUpdateId: data.U,
            lastUpdateId: (_a = data.u) !== null && _a !== void 0 ? _a : data.lastUpdateId,
            prevUpdateId: data.pu,
            bids: (_c = (_b = data.b) !== null && _b !== void 0 ? _b : data.bids) !== null && _c !== void 0 ? _c : [],
            asks: (_e = (_d = data.a) !== null && _d !== void 0 ? _d : data.asks) !== null && _e !== void 0 ? _e : []
        };
    };
    /**
     * 订阅并推送 symbol 的ticker信息
     */
    Aster.prototype.watchTicker = function (symbol, cb) {
        return __awaiter(this, void 0, void 0, function () {
            var useSymbol, channel, ticker, interval_3;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        useSymbol = (symbol || this.defaultMarket).toUpperCase();
                        channel = "".concat(useSymbol.toLowerCase(), "@miniTicker");
                        if (cb)
                            this.tickerUpdateCallbacks.push(cb);
                        this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });
                        if (!(!this.lastTickerData || this.lastTickerData.symbol !== useSymbol)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.getTicker(useSymbol)];
                    case 1:
                        ticker = _a.sent();
                        this.lastTickerData = ticker;
                        _a.label = 2;
                    case 2:
                        // 注册时立即推送
                        if (cb) {
                            if (this.lastTickerData && this.lastTickerData.symbol === useSymbol) {
                                cb(this.lastTickerData);
                            }
                            else {
                                interval_3 = setInterval(function () {
                                    if (_this.lastTickerData && _this.lastTickerData.symbol === useSymbol) {
                                        cb(_this.lastTickerData);
                                        clearInterval(interval_3);
                                    }
                                }, 200);
                            }
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // 格式化ticker推送为标准结构
    Aster.prototype.formatTickerData = function (data) {
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
    };
    /**
     * 订阅并推送 symbol+interval 的k线数据
     */
    Aster.prototype.watchKline = function (symbol, interval, cb) {
        return __awaiter(this, void 0, void 0, function () {
            var klines, channel, intervalId_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.klineSymbol = symbol.toUpperCase();
                        this.klineInterval = interval;
                        this.klineUpdateCallbacks.push(cb);
                        if (!!this.lastKlines.length) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.getKlines({ symbol: this.klineSymbol, interval: this.klineInterval, limit: 100 })];
                    case 1:
                        klines = _a.sent();
                        this.lastKlines = klines.map(this.formatKlineArray);
                        _a.label = 2;
                    case 2:
                        channel = "".concat(symbol.toLowerCase(), "@kline_").concat(interval);
                        this.subscribe({ params: [channel], id: Math.floor(Math.random() * 10000) });
                        // 注册时立即推送
                        if (this.lastKlines.length) {
                            cb(this.lastKlines);
                        }
                        else {
                            intervalId_1 = setInterval(function () {
                                if (_this.lastKlines.length) {
                                    cb(_this.lastKlines);
                                    clearInterval(intervalId_1);
                                }
                            }, 200);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // 格式化 http k线数组
    Aster.prototype.formatKlineArray = function (arr) {
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
    };
    // 格式化 ws kline
    Aster.prototype.formatWsKline = function (k, event) {
        var _a;
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
            eventType: event === null || event === void 0 ? void 0 : event.e,
            eventTime: event === null || event === void 0 ? void 0 : event.E,
            symbol: (_a = k.s) !== null && _a !== void 0 ? _a : event === null || event === void 0 ? void 0 : event.s,
            interval: k.i,
            firstTradeId: k.f,
            lastTradeId: k.L,
            isClosed: k.x
        };
    };
    Aster.prototype.startPolling = function () {
        var _this = this;
        this.pollingIntervalId = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            var account_1, openOrdersResponse, openOrders, newOrderIds, _i, _a, id, _b, openOrders_2, order, err_5;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.getAccount()];
                    case 1:
                        account_1 = _c.sent();
                        if (this.accountSnapshot) {
                            // 直接用新数据的所有字段替换原有内容（无缝覆盖，不clear对象）
                            Object.keys(account_1).forEach(function (key) {
                                _this.accountSnapshot[key] = account_1[key];
                            });
                        }
                        else {
                            this.accountSnapshot = account_1;
                        }
                        this.accountUpdateCallbacks.forEach(function (cb) { return cb(_this.accountSnapshot); });
                        return [4 /*yield*/, this.getOpenOrders({ symbol: this.defaultMarket })];
                    case 2:
                        openOrdersResponse = _c.sent();
                        openOrders = Array.isArray(openOrdersResponse) ? openOrdersResponse : [];
                        newOrderIds = new Set(openOrders.map(function (o) { return o.orderId; }));
                        for (_i = 0, _a = Array.from(this.openOrders.keys()); _i < _a.length; _i++) {
                            id = _a[_i];
                            if (!newOrderIds.has(id)) {
                                this.openOrders.delete(id);
                            }
                        }
                        // 再更新和新增
                        for (_b = 0, openOrders_2 = openOrders; _b < openOrders_2.length; _b++) {
                            order = openOrders_2[_b];
                            this.openOrders.set(order.orderId, order);
                        }
                        this.orderUpdateCallbacks.forEach(function (cb) { return cb(Array.from(_this.openOrders.values())); });
                        return [3 /*break*/, 4];
                    case 3:
                        err_5 = _c.sent();
                        console.error("定时轮询失败:", err_5);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); }, 10000); // 每10秒
    };
    Aster.prototype.stopPolling = function () {
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = undefined;
        }
    };
    return Aster;
}());
exports.Aster = Aster;
