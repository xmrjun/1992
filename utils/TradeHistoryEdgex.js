"use strict";
/**
 * EdgeX-Paradex交易历史记录
 * 参考 aster-bot TradeHistory 设计
 */
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.tradeHistoryEdgex = void 0;
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var TradeHistoryEdgex = /** @class */ (function () {
    function TradeHistoryEdgex() {
        this.openTrades = [];
        this.closedTrades = [];
        this.historyFile = path.join(process.cwd(), 'data', 'trade_history_edgex.json');
        this.loadHistory();
    }
    /**
     * 记录开仓
     */
    TradeHistoryEdgex.prototype.recordOpen = function (trade) {
        var openTrade = {
            direction: trade.direction,
            amount: trade.amount,
            edgexPrice: trade.edgexPrice,
            paradexPrice: trade.paradexPrice,
            edgexFee: trade.edgexFee,
            paradexFee: trade.paradexFee,
            openTime: trade.timestamp,
            openSpread: trade.edgexPrice - trade.paradexPrice
        };
        this.openTrades.push(openTrade);
        this.saveHistory();
    };
    /**
     * 记录平仓
     */
    TradeHistoryEdgex.prototype.recordClose = function (close) {
        if (this.openTrades.length === 0) {
            console.warn('⚠️ 没有开仓记录可平仓');
            return;
        }
        var openTrade = this.openTrades.shift();
        var closeSpread = close.edgexPrice - close.paradexPrice;
        var totalFees = openTrade.edgexFee + openTrade.paradexFee + close.edgexFee + close.paradexFee;
        // 计算盈亏
        var pnl = 0;
        if (openTrade.direction === 'long_edgex_short_paradex') {
            // EdgeX做多: (平仓价 - 开仓价) * 数量
            var edgexPnl = (close.edgexPrice - openTrade.edgexPrice) * openTrade.amount;
            // Paradex做空: (开仓价 - 平仓价) * 数量
            var paradexPnl = (openTrade.paradexPrice - close.paradexPrice) * openTrade.amount;
            pnl = edgexPnl + paradexPnl - totalFees;
        }
        else {
            // EdgeX做空: (开仓价 - 平仓价) * 数量
            var edgexPnl = (openTrade.edgexPrice - close.edgexPrice) * openTrade.amount;
            // Paradex做多: (平仓价 - 开仓价) * 数量
            var paradexPnl = (close.paradexPrice - openTrade.paradexPrice) * openTrade.amount;
            pnl = edgexPnl + paradexPnl - totalFees;
        }
        var closedTrade = __assign(__assign({}, openTrade), { closeTime: close.timestamp, closeSpread: closeSpread, edgexClosePrice: close.edgexPrice, paradexClosePrice: close.paradexPrice, edgexCloseFee: close.edgexFee, paradexCloseFee: close.paradexFee, pnl: pnl, totalFees: totalFees });
        this.closedTrades.push(closedTrade);
        this.saveHistory();
        console.log("\uD83D\uDCCA \u4EA4\u6613\u5B8C\u6210 | \u76C8\u4E8F: $".concat(pnl.toFixed(2), " | \u624B\u7EED\u8D39: $").concat(totalFees.toFixed(2)));
    };
    /**
     * 获取今日统计
     */
    TradeHistoryEdgex.prototype.getTodayStats = function () {
        var today = new Date().toDateString();
        var todayTrades = this.closedTrades.filter(function (t) {
            return new Date(t.closeTime).toDateString() === today;
        });
        var totalPnL = todayTrades.reduce(function (sum, t) { return sum + t.pnl; }, 0);
        var totalFees = todayTrades.reduce(function (sum, t) { return sum + t.totalFees; }, 0);
        var winningTrades = todayTrades.filter(function (t) { return t.pnl > 0; }).length;
        var winRate = todayTrades.length > 0 ? (winningTrades / todayTrades.length) * 100 : 0;
        return {
            totalTrades: todayTrades.length,
            openTrades: this.openTrades.length,
            totalPnL: totalPnL,
            totalFees: totalFees,
            winRate: winRate
        };
    };
    /**
     * 加载历史记录
     */
    TradeHistoryEdgex.prototype.loadHistory = function () {
        try {
            if (fs.existsSync(this.historyFile)) {
                var data = JSON.parse(fs.readFileSync(this.historyFile, 'utf-8'));
                this.openTrades = data.openTrades || [];
                this.closedTrades = data.closedTrades || [];
            }
        }
        catch (error) {
            console.warn('⚠️ 加载交易历史失败，使用空记录');
            this.openTrades = [];
            this.closedTrades = [];
        }
    };
    /**
     * 保存历史记录
     */
    TradeHistoryEdgex.prototype.saveHistory = function () {
        try {
            var dir = path.dirname(this.historyFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.historyFile, JSON.stringify({
                openTrades: this.openTrades,
                closedTrades: this.closedTrades,
                lastUpdate: Date.now()
            }, null, 2));
        }
        catch (error) {
            console.error('❌ 保存交易历史失败:', error);
        }
    };
    /**
     * 清空历史记录
     */
    TradeHistoryEdgex.prototype.clearHistory = function () {
        this.openTrades = [];
        this.closedTrades = [];
        this.saveHistory();
    };
    return TradeHistoryEdgex;
}());
// 单例
exports.tradeHistoryEdgex = new TradeHistoryEdgex();
