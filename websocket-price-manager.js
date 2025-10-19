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
exports.WebSocketPriceManager = void 0;
var ws_1 = require("ws");
var tweetnacl_1 = require("tweetnacl");
var aster_js_1 = require("./exchanges/aster.js");
// WebSocket价格管理器
var WebSocketPriceManager = /** @class */ (function () {
    function WebSocketPriceManager(asterApiKey, asterApiSecret, backpackApiKey, backpackSecretKey) {
        this.backpackWS = null;
        this.backpackPrivateWS = null; // 🔥 Backpack私有流
        // 价格缓存
        this.asterPrice = {
            bid: 0, ask: 0, lastPrice: 0, updateTime: 0, isValid: false, source: 'WebSocket'
        };
        this.backpackPrice = {
            bid: 0, ask: 0, lastPrice: 0, updateTime: 0, isValid: false, source: 'WebSocket'
        };
        // Backpack API密钥
        this.backpackApiKey = '';
        this.backpackSecretKey = '';
        this.asterSDK = new aster_js_1.Aster(asterApiKey, asterApiSecret, 'BTCUSDT');
        this.backpackApiKey = backpackApiKey || '';
        this.backpackSecretKey = backpackSecretKey || '';
    }
    // 🔥 WebSocket优化：公开AsterSDK实例，用于订单/持仓/余额推送
    WebSocketPriceManager.prototype.getAsterSDK = function () {
        return this.asterSDK;
    };
    // 初始化所有WebSocket连接
    WebSocketPriceManager.prototype.initializeAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('🚀 初始化双WebSocket价格系统...');
                        return [4 /*yield*/, Promise.all([
                                this.initAsterWebSocket(),
                                this.initBackpackWebSocket()
                            ])];
                    case 1:
                        _a.sent();
                        console.log('✅ 双WebSocket价格系统初始化完成');
                        return [2 /*return*/];
                }
            });
        });
    };
    // 初始化AsterDx WebSocket
    WebSocketPriceManager.prototype.initAsterWebSocket = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        console.log('🔗 初始化 AsterDx WebSocket...');
                        // 智能等待WebSocket连接建立 (最多5秒)
                        return [4 /*yield*/, this.waitForWebSocketConnection()];
                    case 1:
                        // 智能等待WebSocket连接建立 (最多5秒)
                        _a.sent();
                        // 使用watchTicker获取实时价格数据
                        this.asterSDK.watchTicker('BTCUSDT', function (ticker) {
                            if (ticker && ticker.symbol === 'BTCUSDT') {
                                _this.asterPrice.lastPrice = parseFloat(ticker.lastPrice || 0);
                                _this.asterPrice.updateTime = Date.now();
                                // 每30秒打印一次AsterDx价格更新
                                if (Date.now() % 30000 < 1000) {
                                    console.log("\uD83D\uDCE1 AsterDx\u4EF7\u683C: ".concat(ticker.lastPrice, " (Ticker)"));
                                }
                            }
                        });
                        // 使用watchDepth获取实时bid/ask数据
                        this.asterSDK.watchDepth('BTCUSDT', function (depth) {
                            if (depth && depth.symbol === 'BTCUSDT' && depth.bids.length > 0 && depth.asks.length > 0) {
                                _this.asterPrice.bid = parseFloat(depth.bids[0][0]);
                                _this.asterPrice.ask = parseFloat(depth.asks[0][0]);
                                _this.asterPrice.updateTime = Date.now();
                                _this.asterPrice.isValid = true;
                                // 每30秒打印一次深度更新
                                if (Date.now() % 30000 < 1000) {
                                    console.log("\uD83D\uDCCA AsterDx\u6DF1\u5EA6: ".concat(_this.asterPrice.bid, "/").concat(_this.asterPrice.ask));
                                }
                            }
                        });
                        console.log('✅ AsterDx WebSocket连接成功');
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        console.error('❌ AsterDx WebSocket初始化失败:', error_1);
                        setTimeout(function () { return _this.initAsterWebSocket(); }, 5000);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    // 初始化Backpack WebSocket - 基于mading2项目实现
    WebSocketPriceManager.prototype.initBackpackWebSocket = function () {
        return __awaiter(this, void 0, void 0, function () {
            var wsUrl;
            var _this = this;
            return __generator(this, function (_a) {
                try {
                    console.log('🔗 初始化 Backpack WebSocket...');
                    wsUrl = 'wss://ws.backpack.exchange';
                    this.backpackWS = new ws_1.default(wsUrl);
                    this.backpackWS.on('open', function () {
                        console.log('🔗 Backpack WebSocket连接成功');
                        // 使用mading2项目的订阅格式
                        var subscribeMessage = {
                            method: 'SUBSCRIBE',
                            params: ["ticker.BTC_USDC"], // ticker.符号格式
                            id: Date.now()
                        };
                        console.log('📡 订阅Backpack价格流:', JSON.stringify(subscribeMessage));
                        _this.backpackWS.send(JSON.stringify(subscribeMessage));
                        // 启动心跳保持连接
                        setInterval(function () {
                            if (_this.backpackWS && _this.backpackWS.readyState === ws_1.default.OPEN) {
                                var pingMsg = {
                                    method: 'PING',
                                    id: Date.now()
                                };
                                _this.backpackWS.send(JSON.stringify(pingMsg));
                            }
                        }, 30000);
                    });
                    this.backpackWS.on('message', function (data) {
                        try {
                            var message = JSON.parse(data.toString());
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
                                var tickerData = message.data;
                                var price = parseFloat(tickerData.c || 0); // c = current price
                                if (price > 0) {
                                    // 使用实际的bid/ask如果有，否则模拟价差
                                    var bid = tickerData.b ? parseFloat(tickerData.b) : price - (price * 0.0005);
                                    var ask = tickerData.a ? parseFloat(tickerData.a) : price + (price * 0.0005);
                                    _this.backpackPrice = {
                                        bid: bid,
                                        ask: ask,
                                        lastPrice: price,
                                        updateTime: Date.now(),
                                        isValid: true,
                                        source: 'WebSocket'
                                    };
                                    // 每30秒打印一次价格更新
                                    if (Date.now() % 30000 < 1000) {
                                        console.log("\uD83D\uDCE1 Backpack\u4EF7\u683C: ".concat(bid.toFixed(1), "/").concat(ask.toFixed(1), " (").concat(price.toFixed(1), ")"));
                                    }
                                }
                            }
                        }
                        catch (error) {
                            console.error('❌ Backpack WebSocket数据解析失败:', error);
                        }
                    });
                    this.backpackWS.on('error', function (error) {
                        console.error('❌ Backpack WebSocket错误:', error);
                        _this.backpackPrice.isValid = false;
                    });
                    this.backpackWS.on('close', function (code, reason) {
                        console.log("\uD83D\uDD0C Backpack WebSocket\u8FDE\u63A5\u5173\u95ED (".concat(code, ": ").concat(reason, ")\uFF0C5\u79D2\u540E\u91CD\u8FDE"));
                        _this.backpackPrice.isValid = false;
                        setTimeout(function () { return _this.initBackpackWebSocket(); }, 5000);
                    });
                    console.log('✅ Backpack WebSocket初始化完成');
                }
                catch (error) {
                    console.error('❌ Backpack WebSocket初始化失败:', error);
                    setTimeout(function () { return _this.initBackpackWebSocket(); }, 5000);
                }
                return [2 /*return*/];
            });
        });
    };
    // 智能等待WebSocket连接建立
    WebSocketPriceManager.prototype.waitForWebSocketConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var maxWaitTime, checkInterval, startTime;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        maxWaitTime = 5000;
                        checkInterval = 100;
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        if (!(Date.now() - startTime < maxWaitTime)) return [3 /*break*/, 3];
                        // 检查WebSocket连接状态
                        if (this.asterSDK.ws && this.asterSDK.ws.readyState === ws_1.default.OPEN) {
                            console.log("\u26A1 AsterDx WebSocket\u8FDE\u63A5\u5C31\u7EEA (\u7528\u65F6: ".concat(Date.now() - startTime, "ms)"));
                            return [2 /*return*/];
                        }
                        // 等待100ms后重新检查
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, checkInterval); })];
                    case 2:
                        // 等待100ms后重新检查
                        _a.sent();
                        return [3 /*break*/, 1];
                    case 3:
                        console.log('⚠️ WebSocket连接等待超时，继续初始化...');
                        return [2 /*return*/];
                }
            });
        });
    };
    // 获取AsterDx价格 (纯WebSocket)
    WebSocketPriceManager.prototype.getAsterPrice = function () {
        var now = Date.now();
        var dataAge = now - this.asterPrice.updateTime;
        // 检查数据是否在30秒内更新且有效
        if (this.asterPrice.isValid && dataAge < 30000 &&
            this.asterPrice.bid > 0 && this.asterPrice.ask > 0) {
            return __assign({}, this.asterPrice);
        }
        return null; // 无效数据返回null
    };
    // 获取Backpack价格 (纯WebSocket)
    WebSocketPriceManager.prototype.getBackpackPrice = function () {
        var now = Date.now();
        var dataAge = now - this.backpackPrice.updateTime;
        // 检查数据是否在30秒内更新且有效
        if (this.backpackPrice.isValid && dataAge < 30000 &&
            this.backpackPrice.bid > 0 && this.backpackPrice.ask > 0) {
            return __assign({}, this.backpackPrice);
        }
        return null; // 无效数据返回null
    };
    // 检查连接状态
    WebSocketPriceManager.prototype.getConnectionStatus = function () {
        return {
            aster: this.asterPrice.isValid,
            backpack: this.backpackPrice.isValid
        };
    };
    // 获取价格统计
    WebSocketPriceManager.prototype.getPriceStats = function () {
        var asterValid = this.asterPrice.isValid ? '✅' : '❌';
        var backpackValid = this.backpackPrice.isValid ? '✅' : '❌';
        return "\uD83D\uDCCA \u4EF7\u683C\u72B6\u6001: AsterDx ".concat(asterValid, " | Backpack ").concat(backpackValid);
    };
    // 清理连接
    WebSocketPriceManager.prototype.cleanup = function () {
        if (this.backpackWS) {
            this.backpackWS.close();
        }
        if (this.backpackPrivateWS) {
            this.backpackPrivateWS.close();
        }
        // AsterDx SDK会自动处理清理
    };
    // 🔥 WebSocket优化4：初始化Backpack私有流（订单、持仓、余额推送）
    WebSocketPriceManager.prototype.initBackpackPrivateStream = function (orderCallback, positionCallback, balanceCallback) {
        return __awaiter(this, void 0, void 0, function () {
            var ws_2;
            var _this = this;
            return __generator(this, function (_a) {
                if (!this.backpackApiKey || !this.backpackSecretKey) {
                    console.log('⚠️ Backpack API密钥未配置，跳过私有流订阅');
                    return [2 /*return*/];
                }
                try {
                    console.log('🔗 初始化 Backpack 私有WebSocket...');
                    ws_2 = new ws_1.default('wss://ws.backpack.exchange');
                    this.backpackPrivateWS = ws_2;
                    ws_2.on('open', function () {
                        console.log('✅ Backpack 私有WebSocket连接已建立');
                        // 生成签名并订阅
                        var timestamp = Date.now();
                        var window = 5000;
                        var signStr = "instruction=subscribe&timestamp=".concat(timestamp, "&window=").concat(window);
                        // 🔧 修复Node.js v20兼容性：使用tweetnacl进行ED25519签名
                        // Backpack使用32字节ED25519种子，不是标准PKCS8格式
                        var privateKeyBuffer = Buffer.from(_this.backpackSecretKey, 'base64');
                        // 从32字节种子生成ED25519密钥对
                        var keyPair = tweetnacl_1.default.sign.keyPair.fromSeed(privateKeyBuffer);
                        // 签名消息
                        var messageBuffer = Buffer.from(signStr);
                        var signatureBuffer = tweetnacl_1.default.sign.detached(messageBuffer, keyPair.secretKey);
                        var encodedSignature = Buffer.from(signatureBuffer).toString('base64');
                        // 订阅订单、持仓、余额更新
                        var subscribeMessage = {
                            method: 'SUBSCRIBE',
                            params: ['account.orderUpdate', 'account.positionUpdate', 'account.balanceUpdate'],
                            signature: [_this.backpackApiKey, encodedSignature, timestamp.toString(), window.toString()]
                        };
                        ws_2.send(JSON.stringify(subscribeMessage));
                        console.log('📡 已订阅 Backpack: 订单、持仓、余额推送');
                    });
                    ws_2.on('message', function (data) {
                        try {
                            var message = JSON.parse(data.toString());
                            // 订单更新
                            if (message.stream === 'account.orderUpdate' && message.data) {
                                var order = message.data;
                                if (orderCallback) {
                                    orderCallback(order);
                                }
                            }
                            // 持仓更新
                            if (message.stream === 'account.positionUpdate' && message.data) {
                                var position = message.data;
                                if (positionCallback) {
                                    positionCallback(position);
                                }
                            }
                            // 余额更新
                            if (message.stream === 'account.balanceUpdate' && message.data) {
                                var balance = message.data;
                                if (balanceCallback) {
                                    balanceCallback(balance);
                                }
                            }
                        }
                        catch (error) {
                            console.error('❌ Backpack私有流消息解析失败:', error);
                        }
                    });
                    ws_2.on('error', function (error) {
                        console.error('❌ Backpack私有WebSocket错误:', error.message);
                    });
                    ws_2.on('close', function () {
                        console.log('🔌 Backpack私有WebSocket连接关闭，5秒后重连');
                        setTimeout(function () { return _this.initBackpackPrivateStream(orderCallback, positionCallback, balanceCallback); }, 5000);
                    });
                }
                catch (error) {
                    console.error('❌ Backpack私有流初始化失败:', error);
                }
                return [2 /*return*/];
            });
        });
    };
    return WebSocketPriceManager;
}());
exports.WebSocketPriceManager = WebSocketPriceManager;
