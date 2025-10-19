/**
 * EdgeX-Paradex 交易历史记录管理
 * 用于记录和统计套利交易
 */

import * as fs from 'fs';
import * as path from 'path';

// ==================== 类型定义 ====================

/**
 * 开仓记录
 */
export interface OpenTrade {
  id: string;                                       // 交易ID
  direction: 'buy_edgex_sell_paradex' | 'sell_edgex_buy_paradex';
  amount: number;                                    // 交易量 (BTC)
  edgexPrice: number;                                // EdgeX成交价
  paradexPrice: number;                              // Paradex成交价
  edgexFee: number;                                  // EdgeX手续费
  paradexFee: number;                                // Paradex手续费
  openTime: number;                                  // 开仓时间戳
  openSpread: number;                                // 开仓价差
}

/**
 * 平仓记录
 */
export interface ClosedTrade extends OpenTrade {
  closeTime: number;                                 // 平仓时间戳
  closeSpread: number;                               // 平仓价差
  edgexClosePrice: number;                           // EdgeX平仓价
  paradexClosePrice: number;                         // Paradex平仓价
  edgexCloseFee: number;                             // EdgeX平仓手续费
  paradexCloseFee: number;                           // Paradex平仓手续费
  pnl: number;                                       // 实际盈亏
  totalFee: number;                                  // 总手续费
  holdTime: number;                                  // 持仓时长 (毫秒)
}

/**
 * 统计数据
 */
export interface TodayStats {
  totalTrades: number;                               // 今日交易笔数
  openTrades: number;                                // 当前持仓数
  totalVolume: number;                               // 今日交易量 (USD)
  totalPnL: number;                                  // 今日盈亏 (USD)
  totalFees: number;                                 // 今日手续费 (USD)
  winRate: number;                                   // 胜率 (%)
  avgPnL: number;                                    // 平均盈亏
  maxProfit: number;                                 // 最大盈利
  maxLoss: number;                                   // 最大亏损
}

/**
 * 历史数据存储格式
 */
interface HistoryData {
  openTrades: OpenTrade[];
  closedTrades: ClosedTrade[];
  lastUpdate: number;
}

// ==================== 交易历史管理类 ====================

class TradeHistoryEdgexParadex {
  private openTrades: OpenTrade[] = [];
  private closedTrades: ClosedTrade[] = [];
  private historyFile: string;

  constructor() {
    this.historyFile = path.join(process.cwd(), 'data', 'trade-history-edgex-paradex.json');
    this.ensureDataDir();
    this.loadHistory();
  }

  /**
   * 确保数据目录存在
   */
  private ensureDataDir(): void {
    const dataDir = path.dirname(this.historyFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * 生成交易ID
   */
  private generateTradeId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 记录开仓
   */
  recordOpen(trade: {
    direction: 'buy_edgex_sell_paradex' | 'sell_edgex_buy_paradex';
    amount: number;
    edgexPrice: number;
    paradexPrice: number;
    edgexFee: number;
    paradexFee: number;
    timestamp: number;
  }): string {
    const openTrade: OpenTrade = {
      id: this.generateTradeId(),
      direction: trade.direction,
      amount: trade.amount,
      edgexPrice: trade.edgexPrice,
      paradexPrice: trade.paradexPrice,
      edgexFee: trade.edgexFee,
      paradexFee: trade.paradexFee,
      openTime: trade.timestamp,
      openSpread: Math.abs(trade.edgexPrice - trade.paradexPrice)
    };

    this.openTrades.push(openTrade);
    this.saveHistory();

    return openTrade.id;
  }

  /**
   * 记录平仓
   */
  recordClose(trade: {
    id: string;
    edgexClosePrice: number;
    paradexClosePrice: number;
    edgexCloseFee: number;
    paradexCloseFee: number;
    timestamp: number;
  }): void {
    const openTradeIndex = this.openTrades.findIndex(t => t.id === trade.id);

    if (openTradeIndex === -1) {
      console.error(`未找到开仓记录: ${trade.id}`);
      return;
    }

    const openTrade = this.openTrades[openTradeIndex];

    // 计算盈亏
    let pnl = 0;
    if (openTrade.direction === 'buy_edgex_sell_paradex') {
      // 开仓时: EdgeX买入 + Paradex卖出
      // 平仓时: EdgeX卖出 + Paradex买入
      const edgexPnL = (trade.edgexClosePrice - openTrade.edgexPrice) * openTrade.amount;
      const paradexPnL = (openTrade.paradexPrice - trade.paradexClosePrice) * openTrade.amount;
      pnl = edgexPnL + paradexPnL;
    } else {
      // 开仓时: EdgeX卖出 + Paradex买入
      // 平仓时: EdgeX买入 + Paradex卖出
      const edgexPnL = (openTrade.edgexPrice - trade.edgexClosePrice) * openTrade.amount;
      const paradexPnL = (trade.paradexClosePrice - openTrade.paradexPrice) * openTrade.amount;
      pnl = edgexPnL + paradexPnL;
    }

    // 扣除手续费
    const totalFee = openTrade.edgexFee + openTrade.paradexFee +
                     trade.edgexCloseFee + trade.paradexCloseFee;
    pnl -= totalFee;

    const closedTrade: ClosedTrade = {
      ...openTrade,
      closeTime: trade.timestamp,
      closeSpread: Math.abs(trade.edgexClosePrice - trade.paradexClosePrice),
      edgexClosePrice: trade.edgexClosePrice,
      paradexClosePrice: trade.paradexClosePrice,
      edgexCloseFee: trade.edgexCloseFee,
      paradexCloseFee: trade.paradexCloseFee,
      pnl,
      totalFee,
      holdTime: trade.timestamp - openTrade.openTime
    };

    this.closedTrades.push(closedTrade);
    this.openTrades.splice(openTradeIndex, 1);
    this.saveHistory();
  }

  /**
   * 获取所有开仓记录
   */
  getOpenTrades(): OpenTrade[] {
    return [...this.openTrades];
  }

  /**
   * 获取所有已平仓记录
   */
  getClosedTrades(): ClosedTrade[] {
    return [...this.closedTrades];
  }

  /**
   * 获取今日统计数据
   */
  getTodayStats(): TodayStats {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // 筛选今日已平仓交易
    const todayClosedTrades = this.closedTrades.filter(
      t => t.closeTime >= todayTimestamp
    );

    // 计算统计数据
    const totalTrades = todayClosedTrades.length;
    const openTrades = this.openTrades.length;

    let totalVolume = 0;
    let totalPnL = 0;
    let totalFees = 0;
    let winningTrades = 0;
    let maxProfit = 0;
    let maxLoss = 0;

    todayClosedTrades.forEach(trade => {
      totalVolume += trade.amount * trade.edgexPrice * 2; // 双边交易量
      totalPnL += trade.pnl;
      totalFees += trade.totalFee;

      if (trade.pnl > 0) {
        winningTrades++;
        maxProfit = Math.max(maxProfit, trade.pnl);
      } else {
        maxLoss = Math.min(maxLoss, trade.pnl);
      }
    });

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

    return {
      totalTrades,
      openTrades,
      totalVolume,
      totalPnL,
      totalFees,
      winRate,
      avgPnL,
      maxProfit,
      maxLoss
    };
  }

  /**
   * 保存历史数据到文件
   */
  private saveHistory(): void {
    try {
      const data: HistoryData = {
        openTrades: this.openTrades,
        closedTrades: this.closedTrades,
        lastUpdate: Date.now()
      };

      fs.writeFileSync(
        this.historyFile,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('保存交易历史失败:', error);
    }
  }

  /**
   * 从文件加载历史数据
   */
  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const fileContent = fs.readFileSync(this.historyFile, 'utf-8');
        const data: HistoryData = JSON.parse(fileContent);

        this.openTrades = data.openTrades || [];
        this.closedTrades = data.closedTrades || [];

        console.log(`✅ 加载交易历史: ${this.openTrades.length}个持仓, ${this.closedTrades.length}笔已平仓`);
      } else {
        console.log('📝 创建新的交易历史文件');
      }
    } catch (error) {
      console.error('加载交易历史失败:', error);
      this.openTrades = [];
      this.closedTrades = [];
    }
  }

  /**
   * 清除今日数据（仅用于测试）
   */
  clearTodayData(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    this.closedTrades = this.closedTrades.filter(
      t => t.closeTime < todayTimestamp
    );
    this.saveHistory();

    console.log('🗑️  已清除今日数据');
  }
}

// ==================== 导出单例 ====================

export const tradeHistoryEdgexParadex = new TradeHistoryEdgexParadex();

export default tradeHistoryEdgexParadex;
