/**
 * EdgeX-Paradex交易历史记录
 * 参考 aster-bot TradeHistory 设计
 */

import * as fs from 'fs';
import * as path from 'path';

interface OpenTrade {
  direction: 'long_edgex_short_paradex' | 'short_edgex_long_paradex';
  amount: number;
  edgexPrice: number;
  paradexPrice: number;
  edgexFee: number;
  paradexFee: number;
  openTime: number;
  openSpread: number;
}

interface ClosedTrade extends OpenTrade {
  closeTime: number;
  closeSpread: number;
  edgexClosePrice: number;
  paradexClosePrice: number;
  edgexCloseFee: number;
  paradexCloseFee: number;
  pnl: number;
  totalFees: number;
}

class TradeHistoryEdgex {
  private openTrades: OpenTrade[] = [];
  private closedTrades: ClosedTrade[] = [];
  private historyFile = path.join(process.cwd(), 'data', 'trade_history_edgex.json');

  constructor() {
    this.loadHistory();
  }

  /**
   * 记录开仓
   */
  recordOpen(trade: {
    direction: 'long_edgex_short_paradex' | 'short_edgex_long_paradex';
    amount: number;
    edgexPrice: number;
    paradexPrice: number;
    edgexFee: number;
    paradexFee: number;
    timestamp: number;
  }): void {
    const openTrade: OpenTrade = {
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
  }

  /**
   * 记录平仓
   */
  recordClose(close: {
    edgexPrice: number;
    paradexPrice: number;
    edgexFee: number;
    paradexFee: number;
    timestamp: number;
  }): void {
    if (this.openTrades.length === 0) {
      console.warn('⚠️ 没有开仓记录可平仓');
      return;
    }

    const openTrade = this.openTrades.shift()!;
    const closeSpread = close.edgexPrice - close.paradexPrice;
    const totalFees = openTrade.edgexFee + openTrade.paradexFee + close.edgexFee + close.paradexFee;

    // 计算盈亏
    let pnl = 0;
    if (openTrade.direction === 'long_edgex_short_paradex') {
      // EdgeX做多: (平仓价 - 开仓价) * 数量
      const edgexPnl = (close.edgexPrice - openTrade.edgexPrice) * openTrade.amount;
      // Paradex做空: (开仓价 - 平仓价) * 数量
      const paradexPnl = (openTrade.paradexPrice - close.paradexPrice) * openTrade.amount;
      pnl = edgexPnl + paradexPnl - totalFees;
    } else {
      // EdgeX做空: (开仓价 - 平仓价) * 数量
      const edgexPnl = (openTrade.edgexPrice - close.edgexPrice) * openTrade.amount;
      // Paradex做多: (平仓价 - 开仓价) * 数量
      const paradexPnl = (close.paradexPrice - openTrade.paradexPrice) * openTrade.amount;
      pnl = edgexPnl + paradexPnl - totalFees;
    }

    const closedTrade: ClosedTrade = {
      ...openTrade,
      closeTime: close.timestamp,
      closeSpread,
      edgexClosePrice: close.edgexPrice,
      paradexClosePrice: close.paradexPrice,
      edgexCloseFee: close.edgexFee,
      paradexCloseFee: close.paradexFee,
      pnl,
      totalFees
    };

    this.closedTrades.push(closedTrade);
    this.saveHistory();

    console.log(`📊 交易完成 | 盈亏: $${pnl.toFixed(2)} | 手续费: $${totalFees.toFixed(2)}`);
  }

  /**
   * 获取今日统计
   */
  getTodayStats(): {
    totalTrades: number;
    openTrades: number;
    totalPnL: number;
    totalFees: number;
    winRate: number;
  } {
    const today = new Date().toDateString();
    const todayTrades = this.closedTrades.filter(t =>
      new Date(t.closeTime).toDateString() === today
    );

    const totalPnL = todayTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalFees = todayTrades.reduce((sum, t) => sum + t.totalFees, 0);
    const winningTrades = todayTrades.filter(t => t.pnl > 0).length;
    const winRate = todayTrades.length > 0 ? (winningTrades / todayTrades.length) * 100 : 0;

    return {
      totalTrades: todayTrades.length,
      openTrades: this.openTrades.length,
      totalPnL,
      totalFees,
      winRate
    };
  }

  /**
   * 加载历史记录
   */
  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = JSON.parse(fs.readFileSync(this.historyFile, 'utf-8'));
        this.openTrades = data.openTrades || [];
        this.closedTrades = data.closedTrades || [];
      }
    } catch (error) {
      console.warn('⚠️ 加载交易历史失败，使用空记录');
      this.openTrades = [];
      this.closedTrades = [];
    }
  }

  /**
   * 保存历史记录
   */
  private saveHistory(): void {
    try {
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.historyFile,
        JSON.stringify({
          openTrades: this.openTrades,
          closedTrades: this.closedTrades,
          lastUpdate: Date.now()
        }, null, 2)
      );
    } catch (error) {
      console.error('❌ 保存交易历史失败:', error);
    }
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.openTrades = [];
    this.closedTrades = [];
    this.saveHistory();
  }
}

// 单例
export const tradeHistoryEdgex = new TradeHistoryEdgex();
