/**
 * 简化的EdgeX-Paradex交易执行器
 * 参考 aster-bot SimpleTrader 设计
 */

import { TradeExecutor } from '../TradeExecutor';
import { tradeHistoryEdgex } from './TradeHistoryEdgex';
import * as fs from 'fs';
import * as path from 'path';

type PositionDirection = 'long_edgex_short_paradex' | 'short_edgex_long_paradex';

interface CurrentPosition {
  direction: PositionDirection;
  amount: number;
  edgexPrice: number;
  paradexPrice: number;
  edgexFee: number;
  paradexFee: number;
  openTime: number;
}

export class SimpleTraderEdgex {
  private executor: TradeExecutor;
  private currentPosition: CurrentPosition | null = null;
  private positionFilePath: string;

  constructor() {
    this.executor = new TradeExecutor();
    this.positionFilePath = path.join(process.cwd(), 'data', 'current_position.json');

    // 确保 data 目录存在
    const dataDir = path.dirname(this.positionFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    await this.executor.initialize();
    // 启动时加载持仓
    this.loadPosition();
  }

  /**
   * 从本地文件加载持仓
   */
  private loadPosition(): void {
    try {
      if (fs.existsSync(this.positionFilePath)) {
        const data = fs.readFileSync(this.positionFilePath, 'utf-8');
        this.currentPosition = JSON.parse(data);
        console.log('📂 从本地加载持仓:', this.currentPosition);
      }
    } catch (error: any) {
      console.error('❌ 加载持仓文件失败:', error.message);
      this.currentPosition = null;
    }
  }

  /**
   * 保存持仓到本地文件
   */
  private savePosition(): void {
    try {
      if (this.currentPosition) {
        fs.writeFileSync(this.positionFilePath, JSON.stringify(this.currentPosition, null, 2));
      } else {
        // 清空持仓时删除文件
        if (fs.existsSync(this.positionFilePath)) {
          fs.unlinkSync(this.positionFilePath);
        }
      }
    } catch (error: any) {
      console.error('❌ 保存持仓文件失败:', error.message);
    }
  }

  /**
   * 检查是否有持仓（从本地文件读取）
   */
  async hasOpenPositions(): Promise<boolean> {
    return this.currentPosition !== null;
  }

  /**
   * 开仓
   */
  async openPosition(direction: PositionDirection, amount: number): Promise<{ success: boolean; error?: string }> {
    console.log(`\n📝 开仓: ${direction}, 数量: ${amount}`);

    try {
      let edgexResult, paradexResult;

      if (direction === 'long_edgex_short_paradex') {
        // EdgeX 买入，Paradex 卖出
        [edgexResult, paradexResult] = await Promise.all([
          this.executor.placeEdgeXOrder('buy', amount),
          this.executor.placeParadexOrder('sell', amount),
        ]);
      } else {
        // EdgeX 卖出，Paradex 买入
        [edgexResult, paradexResult] = await Promise.all([
          this.executor.placeEdgeXOrder('sell', amount),
          this.executor.placeParadexOrder('buy', amount),
        ]);
      }

      // 简化验证：只要有返回数据就认为成功（等待10秒后返回的数据）
      const edgexFilled = edgexResult.fillData?.fillSize || 0;
      const paradexFilled = paradexResult.fillData?.size || 0;

      // 保存持仓到内存和本地文件
      this.currentPosition = {
        direction,
        amount: edgexFilled,
        edgexPrice: edgexResult.fillData.fillPrice,
        paradexPrice: paradexResult.fillData.price,
        edgexFee: edgexResult.fillData.fillFee,
        paradexFee: paradexResult.fillData.fee,
        openTime: Date.now()
      };
      this.savePosition();

      // 记录交易历史
      tradeHistoryEdgex.recordOpen({
        direction,
        amount: edgexFilled,
        edgexPrice: edgexResult.fillData.fillPrice,
        paradexPrice: paradexResult.fillData.price,
        edgexFee: edgexResult.fillData.fillFee,
        paradexFee: paradexResult.fillData.fee,
        timestamp: Date.now()
      });

      console.log(`✅ 开仓成功: ${direction}`);
      console.log(`   EdgeX: ${edgexResult.fillData.fillPrice} (${edgexFilled} BTC)`);
      console.log(`   Paradex: ${paradexResult.fillData.price} (${paradexFilled} BTC)`);

      return { success: true };

    } catch (error: any) {
      console.error('❌ 开仓异常:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 平仓所有持仓
   */
  async closeAllPositions(): Promise<boolean> {
    console.log(`\n🔄 平仓所有持仓...`);

    if (!this.currentPosition) {
      console.log('⚠️ 没有持仓需要平仓');
      return false;
    }

    try {
      let edgexResult, paradexResult;

      // 根据开仓方向反向平仓
      if (this.currentPosition.direction === 'long_edgex_short_paradex') {
        // 原来 EdgeX 买入，Paradex 卖出 → 现在反向平仓
        [edgexResult, paradexResult] = await Promise.all([
          this.executor.placeEdgeXOrder('sell', this.currentPosition.amount),
          this.executor.placeParadexOrder('buy', this.currentPosition.amount),
        ]);
      } else {
        // 原来 EdgeX 卖出，Paradex 买入 → 现在反向平仓
        [edgexResult, paradexResult] = await Promise.all([
          this.executor.placeEdgeXOrder('buy', this.currentPosition.amount),
          this.executor.placeParadexOrder('sell', this.currentPosition.amount),
        ]);
      }

      // 验证平仓结果
      if (!edgexResult.success || !paradexResult.success) {
        console.error('❌ 平仓失败: 部分订单未成交');
        console.error('EdgeX:', edgexResult.error);
        console.error('Paradex:', paradexResult.error);
        return false;
      }

      // 记录平仓
      tradeHistoryEdgex.recordClose({
        edgexPrice: edgexResult.fillData.fillPrice,
        paradexPrice: paradexResult.fillData.price,
        edgexFee: edgexResult.fillData.fillFee,
        paradexFee: paradexResult.fillData.fee,
        timestamp: Date.now()
      });

      console.log('✅ 平仓成功');
      console.log(`   EdgeX: ${edgexResult.fillData.fillPrice}, Paradex: ${paradexResult.fillData.price}`);

      // 清空持仓记录（内存和文件）
      this.currentPosition = null;
      this.savePosition();

      return true;

    } catch (error: any) {
      console.error('❌ 平仓异常:', error.message);
      return false;
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    await this.executor.close();
  }

  /**
   * 监听价格更新
   */
  on(event: string, callback: (data: any) => void): void {
    this.executor.on(event, callback);
  }
}
