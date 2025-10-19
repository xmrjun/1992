"use strict";
/**
 * 简化的EdgeX-Paradex交易执行器
 * 参考 aster-bot SimpleTrader 设计
 */
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
exports.SimpleTraderEdgex = void 0;
var TradeExecutor_1 = require("../TradeExecutor");
var TradeHistoryEdgex_1 = require("./TradeHistoryEdgex");
var SimpleTraderEdgex = /** @class */ (function () {
    function SimpleTraderEdgex() {
        // 当前持仓（用开仓返回数据记录）
        this.currentPosition = null;
        this.executor = new TradeExecutor_1.TradeExecutor();
    }
    SimpleTraderEdgex.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.executor.initialize()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 检查是否有持仓（直接看内存记录）
     */
    SimpleTraderEdgex.prototype.hasOpenPositions = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.currentPosition !== null];
            });
        });
    };
    /**
     * 开仓
     */
    SimpleTraderEdgex.prototype.openPosition = function (direction, amount) {
        return __awaiter(this, void 0, void 0, function () {
            var edgexResult, paradexResult, edgexFilled, paradexFilled, error_1;
            var _a, _b;
            var _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        console.log("\n\uD83D\uDCDD \u5F00\u4ED3: ".concat(direction, ", \u6570\u91CF: ").concat(amount));
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 6, , 7]);
                        edgexResult = void 0, paradexResult = void 0;
                        if (!(direction === 'long_edgex_short_paradex')) return [3 /*break*/, 3];
                        return [4 /*yield*/, Promise.all([
                                this.executor.placeEdgeXOrder('buy', amount),
                                this.executor.placeParadexOrder('sell', amount),
                            ])];
                    case 2:
                        // EdgeX 买入，Paradex 卖出
                        _a = _e.sent(), edgexResult = _a[0], paradexResult = _a[1];
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, Promise.all([
                            this.executor.placeEdgeXOrder('sell', amount),
                            this.executor.placeParadexOrder('buy', amount),
                        ])];
                    case 4:
                        // EdgeX 卖出，Paradex 买入
                        _b = _e.sent(), edgexResult = _b[0], paradexResult = _b[1];
                        _e.label = 5;
                    case 5:
                        // 验证两边都成交
                        if (!edgexResult.success || !paradexResult.success) {
                            console.error('❌ 开仓失败: 部分订单未成交');
                            console.error('EdgeX:', edgexResult.error);
                            console.error('Paradex:', paradexResult.error);
                            return [2 /*return*/, { success: false, error: '部分订单未成交' }];
                        }
                        edgexFilled = ((_c = edgexResult.fillData) === null || _c === void 0 ? void 0 : _c.fillSize) || 0;
                        paradexFilled = ((_d = paradexResult.fillData) === null || _d === void 0 ? void 0 : _d.size) || 0;
                        if (Math.abs(edgexFilled - paradexFilled) > 0.0001) {
                            console.error("\u274C \u6210\u4EA4\u6570\u91CF\u4E0D\u4E00\u81F4: EdgeX ".concat(edgexFilled, ", Paradex ").concat(paradexFilled));
                            return [2 /*return*/, { success: false, error: '成交数量不一致' }];
                        }
                        // 保存持仓到内存
                        this.currentPosition = {
                            direction: direction,
                            amount: edgexFilled,
                            edgexPrice: edgexResult.fillData.fillPrice,
                            paradexPrice: paradexResult.fillData.price,
                            edgexFee: edgexResult.fillData.fillFee,
                            paradexFee: paradexResult.fillData.fee,
                            openTime: Date.now()
                        };
                        // 记录交易历史
                        TradeHistoryEdgex_1.tradeHistoryEdgex.recordOpen({
                            direction: direction,
                            amount: edgexFilled,
                            edgexPrice: edgexResult.fillData.fillPrice,
                            paradexPrice: paradexResult.fillData.price,
                            edgexFee: edgexResult.fillData.fillFee,
                            paradexFee: paradexResult.fillData.fee,
                            timestamp: Date.now()
                        });
                        console.log("\u2705 \u5F00\u4ED3\u6210\u529F: ".concat(direction));
                        console.log("   EdgeX: ".concat(edgexResult.fillData.fillPrice, ", Paradex: ").concat(paradexResult.fillData.price));
                        console.log("   \u6210\u4EA4\u6570\u91CF: ".concat(edgexFilled, " BTC"));
                        return [2 /*return*/, { success: true }];
                    case 6:
                        error_1 = _e.sent();
                        console.error('❌ 开仓异常:', error_1.message);
                        return [2 /*return*/, { success: false, error: error_1.message }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 平仓所有持仓
     */
    SimpleTraderEdgex.prototype.closeAllPositions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var edgexResult, paradexResult, error_2;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        console.log("\n\uD83D\uDD04 \u5E73\u4ED3\u6240\u6709\u6301\u4ED3...");
                        if (!this.currentPosition) {
                            console.log('⚠️ 没有持仓需要平仓');
                            return [2 /*return*/, false];
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 6, , 7]);
                        edgexResult = void 0, paradexResult = void 0;
                        if (!(this.currentPosition.direction === 'long_edgex_short_paradex')) return [3 /*break*/, 3];
                        return [4 /*yield*/, Promise.all([
                                this.executor.placeEdgeXOrder('sell', this.currentPosition.amount),
                                this.executor.placeParadexOrder('buy', this.currentPosition.amount),
                            ])];
                    case 2:
                        // 原来 EdgeX 买入，Paradex 卖出 → 现在反向平仓
                        _a = _c.sent(), edgexResult = _a[0], paradexResult = _a[1];
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, Promise.all([
                            this.executor.placeEdgeXOrder('buy', this.currentPosition.amount),
                            this.executor.placeParadexOrder('sell', this.currentPosition.amount),
                        ])];
                    case 4:
                        // 原来 EdgeX 卖出，Paradex 买入 → 现在反向平仓
                        _b = _c.sent(), edgexResult = _b[0], paradexResult = _b[1];
                        _c.label = 5;
                    case 5:
                        // 验证平仓结果
                        if (!edgexResult.success || !paradexResult.success) {
                            console.error('❌ 平仓失败: 部分订单未成交');
                            console.error('EdgeX:', edgexResult.error);
                            console.error('Paradex:', paradexResult.error);
                            return [2 /*return*/, false];
                        }
                        // 记录平仓
                        TradeHistoryEdgex_1.tradeHistoryEdgex.recordClose({
                            edgexPrice: edgexResult.fillData.fillPrice,
                            paradexPrice: paradexResult.fillData.price,
                            edgexFee: edgexResult.fillData.fillFee,
                            paradexFee: paradexResult.fillData.fee,
                            timestamp: Date.now()
                        });
                        console.log('✅ 平仓成功');
                        console.log("   EdgeX: ".concat(edgexResult.fillData.fillPrice, ", Paradex: ").concat(paradexResult.fillData.price));
                        // 清空持仓记录
                        this.currentPosition = null;
                        return [2 /*return*/, true];
                    case 6:
                        error_2 = _c.sent();
                        console.error('❌ 平仓异常:', error_2.message);
                        return [2 /*return*/, false];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 关闭连接
     */
    SimpleTraderEdgex.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.executor.close()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 监听价格更新
     */
    SimpleTraderEdgex.prototype.on = function (event, callback) {
        this.executor.on(event, callback);
    };
    return SimpleTraderEdgex;
}());
exports.SimpleTraderEdgex = SimpleTraderEdgex;
