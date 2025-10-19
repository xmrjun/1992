"use strict";
/**
 * 简化版 EdgeX-Paradex 套利机器人
 * 参考 aster-bot 设计，移除复杂的PositionManager
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv_1 = __importDefault(require("dotenv"));
var SimpleTraderEdgex_1 = require("./utils/SimpleTraderEdgex");
var TradeHistoryEdgex_1 = require("./utils/TradeHistoryEdgex");
// 加载环境变量
dotenv_1.default.config({ path: '.env.edgex' });
dotenv_1.default.config({ path: '.env.paradex' });
// 配置参数
var CONFIG = {
    tradeAmount: parseFloat(process.env.TRADE_AMOUNT || '0.005'),
    openThreshold: parseFloat(process.env.OPEN_THRESHOLD || '100'),
    closeThreshold: parseFloat(process.env.CLOSE_THRESHOLD || '40'),
    checkInterval: parseInt(process.env.CHECK_INTERVAL || '5000'),
};
// 简化的交易器
var trader = new SimpleTraderEdgex_1.SimpleTraderEdgex();
// 当前价格
var edgexPrice = 0;
var paradexPrice = 0;
// 交易锁
var isTrading = false;
function log(message, type) {
    if (type === void 0) { type = 'info'; }
    var timestamp = new Date().toLocaleString();
    var prefix = { info: '📊', success: '✅', error: '❌', warn: '⚠️' }[type];
    console.log("[".concat(timestamp, "] ").concat(prefix, " ").concat(message));
}
/**
 * 价格检查和交易逻辑
 */
function checkPricesAndTrade() {
    return __awaiter(this, void 0, void 0, function () {
        var priceDiff, spreadAbs, hasPosition, stats, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (isTrading)
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 10, 11, 12]);
                    isTrading = true;
                    // 验证价格有效性
                    if (edgexPrice <= 0 || paradexPrice <= 0) {
                        return [2 /*return*/];
                    }
                    priceDiff = paradexPrice - edgexPrice;
                    spreadAbs = Math.abs(priceDiff);
                    return [4 /*yield*/, trader.hasOpenPositions()];
                case 2:
                    hasPosition = _a.sent();
                    stats = TradeHistoryEdgex_1.tradeHistoryEdgex.getTodayStats();
                    // 显示状态
                    log("\u4EF7\u5DEE: $".concat(priceDiff.toFixed(2), " (\u7EDD\u5BF9\u503C: $").concat(spreadAbs.toFixed(2), ") | ") +
                        "EdgeX: $".concat(edgexPrice.toFixed(2), " | Paradex: $").concat(paradexPrice.toFixed(2), " | ") +
                        "\u6301\u4ED3: ".concat(hasPosition ? '有' : '无', " | \u4ECA\u65E5\u4EA4\u6613: ").concat(stats.totalTrades, "\u7B14"), 'info');
                    if (!(!hasPosition && spreadAbs >= CONFIG.openThreshold)) return [3 /*break*/, 7];
                    if (!(priceDiff > 0)) return [3 /*break*/, 4];
                    // Paradex价格高 → Paradex做空，EdgeX做多
                    log("\u89E6\u53D1\u5F00\u4ED3: Paradex\u9AD8 $".concat(priceDiff.toFixed(2), " \u2192 Paradex\u505A\u7A7A+EdgeX\u505A\u591A"), 'success');
                    return [4 /*yield*/, trader.openPosition('long_edgex_short_paradex', CONFIG.tradeAmount)];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4:
                    // EdgeX价格高 → EdgeX做空，Paradex做多
                    log("\u89E6\u53D1\u5F00\u4ED3: EdgeX\u9AD8 $".concat(Math.abs(priceDiff).toFixed(2), " \u2192 EdgeX\u505A\u7A7A+Paradex\u505A\u591A"), 'success');
                    return [4 /*yield*/, trader.openPosition('short_edgex_long_paradex', CONFIG.tradeAmount)];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [3 /*break*/, 9];
                case 7:
                    if (!(hasPosition && spreadAbs <= CONFIG.closeThreshold)) return [3 /*break*/, 9];
                    // 平仓
                    log("\u89E6\u53D1\u5E73\u4ED3 (\u4EF7\u5DEE\u6536\u655B: $".concat(spreadAbs.toFixed(2), " <= $").concat(CONFIG.closeThreshold, ")"), 'warn');
                    return [4 /*yield*/, trader.closeAllPositions()];
                case 8:
                    _a.sent();
                    _a.label = 9;
                case 9: return [3 /*break*/, 12];
                case 10:
                    error_1 = _a.sent();
                    log("\u4EF7\u683C\u68C0\u67E5\u5F02\u5E38: ".concat(error_1.message), 'error');
                    return [3 /*break*/, 12];
                case 11:
                    isTrading = false;
                    return [7 /*endfinally*/];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/**
 * 统计报告
 */
function printStats() {
    var stats = TradeHistoryEdgex_1.tradeHistoryEdgex.getTodayStats();
    console.log('\n=== 📊 今日交易统计 ===');
    console.log("\u4EA4\u6613\u7B14\u6570: ".concat(stats.totalTrades));
    console.log("\u5F53\u524D\u6301\u4ED3: ".concat(stats.openTrades));
    console.log("\u4ECA\u65E5\u76C8\u4E8F: $".concat(stats.totalPnL.toFixed(2)));
    console.log("\u624B\u7EED\u8D39: $".concat(stats.totalFees.toFixed(2)));
    console.log("\u80DC\u7387: ".concat(stats.winRate.toFixed(1), "%"));
    console.log('========================\n');
}
/**
 * 主程序
 */
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    log('🚀 启动简化版 EdgeX-Paradex 套利机器人', 'success');
                    log("\u4EA4\u6613\u53C2\u6570: \u6570\u91CF=".concat(CONFIG.tradeAmount, " BTC | \u5F00\u4ED3\u9608\u503C=$").concat(CONFIG.openThreshold, " | \u5E73\u4ED3\u9608\u503C=$").concat(CONFIG.closeThreshold), 'info');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    // 初始化交易器
                    return [4 /*yield*/, trader.initialize()];
                case 2:
                    // 初始化交易器
                    _a.sent();
                    // 监听价格更新
                    trader.on('edgex_price', function (data) {
                        edgexPrice = data.mid;
                    });
                    trader.on('paradex_price', function (data) {
                        paradexPrice = data.mid;
                    });
                    log('✅ 交易器初始化完成', 'success');
                    // 显示初始统计
                    printStats();
                    // 主循环
                    setInterval(checkPricesAndTrade, CONFIG.checkInterval);
                    // 定期统计报告
                    setInterval(printStats, 60000);
                    log('✅ 套利机器人已启动，监听价差机会...', 'success');
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    log("\u542F\u52A8\u5931\u8D25: ".concat(error_2.message), 'error');
                    process.exit(1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// 优雅退出
function shutdown(signal) {
    return __awaiter(this, void 0, void 0, function () {
        var error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    log("\u6536\u5230 ".concat(signal, " \u4FE1\u53F7\uFF0C\u6B63\u5728\u505C\u6B62\u673A\u5668\u4EBA..."), 'warn');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, trader.close()];
                case 2:
                    _a.sent();
                    printStats();
                    log('机器人已安全停止', 'success');
                    process.exit(0);
                    return [3 /*break*/, 4];
                case 3:
                    error_3 = _a.sent();
                    log("\u505C\u6B62\u673A\u5668\u4EBA\u65F6\u51FA\u9519: ".concat(error_3.message), 'error');
                    process.exit(1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
process.on('SIGINT', function () { return shutdown('SIGINT'); });
process.on('SIGTERM', function () { return shutdown('SIGTERM'); });
process.on('unhandledRejection', function (reason) {
    log("\u672A\u5904\u7406\u7684Promise\u62D2\u7EDD: ".concat(reason), 'error');
});
process.on('uncaughtException', function (error) {
    log("\u672A\u6355\u83B7\u7684\u5F02\u5E38: ".concat(error.message), 'error');
    shutdown('uncaughtException');
});
// 启动
main();
