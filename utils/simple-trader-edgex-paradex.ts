/**
 * EdgeX-Paradex 交易执行器 (TypeScript版本)
 * 基于现有 TradeExecutor.js 架构
 */

import { createRequire } from 'module';
import { tradeHistoryEdgexParadex } from './trade-history-edgex-paradex.js';

const require = createRequire(import.meta.url);
const { TradeExecutor } = require('../TradeExecutor.js');

// ==================== 类型定义 ====================

interface Position {
  id: string;                                            // 交易ID
  direction: 'buy_edgex_sell_paradex' | 'sell_edgex_buy_paradex';
  amount: number;
  edgexPrice: number;
  paradexPrice: number;
  edgexFee: number;
  paradexFee: number;
  openTime: number;
  openSpread: number;                                    // 开仓价差
}

interface OrderResult {
  success: boolean;
  error?: string;
  fillData?: {
    fillPrice?: number;
    price?: number;
    fillSize?: number;
    size?: number;
    fillFee?: number;
    fee?: number;
  };
}

// ==================== SimpleTraderEdgexParadex ====================

export class SimpleTraderEdgexParadex {
  private executor: any;  // TradeExecutor from JS (CommonJS)
  private currentPosition: Position | null = null;
  private isClosing: boolean = false;  // 🔧 正在平仓标志，防止重复平仓

  constructor() {
    this.executor = new TradeExecutor();
  }

  /**
   * 查询 EdgeX 持仓
   */
  private async getEdgeXPosition(): Promise<number> {
    if (!this.executor.edgexProcess || !this.executor.edgexProcess.stdin) {
      throw new Error('EdgeX 服务未运行');
    }

    return new Promise((resolve, reject) => {
      const id = `edgex_position_${Date.now()}`;
      const command = {
        id,
        action: 'get_position',
        params: { contract_id: '10000001' }
      };

      const timeout = setTimeout(() => {
        this.executor.commandCallbacks.delete(id);
        reject(new Error('EdgeX 持仓查询超时'));
      }, 10000);

      this.executor.commandCallbacks.set(id, (result: any) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve(result.data.position || 0);
        } else {
          reject(new Error(result.error || 'EdgeX 持仓查询失败'));
        }
      });

      this.executor.edgexProcess.stdin.write(JSON.stringify(command) + '\n');
    });
  }

  /**
   * 查询 Paradex 持仓
   */
  private async getParadexPosition(): Promise<number> {
    if (!this.executor.paradexProcess || !this.executor.paradexProcess.stdin) {
      throw new Error('Paradex 服务未运行');
    }

    return new Promise((resolve, reject) => {
      const id = `paradex_position_${Date.now()}`;
      const command = {
        id,
        action: 'get_position',
        params: { market: 'BTC-USD-PERP' }
      };

      const timeout = setTimeout(() => {
        this.executor.commandCallbacks.delete(id);
        reject(new Error('Paradex 持仓查询超时'));
      }, 10000);

      this.executor.commandCallbacks.set(id, (result: any) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve(result.data.position || 0);
        } else {
          reject(new Error(result.error || 'Paradex 持仓查询失败'));
        }
      });

      this.executor.paradexProcess.stdin.write(JSON.stringify(command) + '\n');
    });
  }

  /**
   * 启动时同步持仓状态
   */
  private async syncPositionsOnStartup(): Promise<void> {
    console.log('🔄 同步持仓状态...');

    try {
      const edgexPos = await this.getEdgeXPosition();
      const paradexPos = await this.getParadexPosition();

      // ✅ 修复：先检查是否有持仓，再判断是否对冲
      const hasPosition = Math.abs(edgexPos) > 0.0001 || Math.abs(paradexPos) > 0.0001;

      if (!hasPosition) {
        console.log('✅ 无持仓');
        return;
      }

      console.log(`   EdgeX: ${edgexPos > 0 ? '+' : ''}${edgexPos} BTC | Paradex: ${paradexPos > 0 ? '+' : ''}${paradexPos} BTC`);

      // 有持仓，检查是否对冲
      const totalPos = Math.abs(edgexPos + paradexPos);

      if (totalPos > 0.0001) {
        // 不对冲的持仓 → 自动平仓
        console.warn(`⚠️  不对冲持仓（差额: ${totalPos.toFixed(4)} BTC），正在自动平仓...`);

        let edgexSuccess = true;
        let paradexSuccess = true;

        // 平 EdgeX 持仓
        if (Math.abs(edgexPos) > 0.0001) {
          const edgexSide = edgexPos > 0 ? 'sell' : 'buy';
          const result = await this.executor.placeEdgeXOrder(edgexSide, Math.abs(edgexPos));
          if (!result.success) {
            console.error(`   ❌ EdgeX 平仓失败: ${result.error}`);
            edgexSuccess = false;
          }
        }

        // 平 Paradex 持仓
        if (Math.abs(paradexPos) > 0.0001) {
          const paradexSide = paradexPos > 0 ? 'sell' : 'buy';
          const result = await this.executor.placeParadexOrder(paradexSide, Math.abs(paradexPos));
          if (!result.success) {
            console.error(`   ❌ Paradex 平仓失败: ${result.error}`);
            paradexSuccess = false;
          }
        }

        // ✅ 等待 3 秒后再次查询持仓，确认是否真的平掉了
        console.log('⏳ 等待 3 秒后确认平仓...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        const edgexPosAfter = await this.getEdgeXPosition();
        const paradexPosAfter = await this.getParadexPosition();

        if (Math.abs(edgexPosAfter) > 0.0001 || Math.abs(paradexPosAfter) > 0.0001) {
          console.error(`❌ 平仓未完成！EdgeX: ${edgexPosAfter}, Paradex: ${paradexPosAfter}`);
          console.error(`⚠️  请手动处理持仓后重启机器人`);
          throw new Error('平仓失败，请手动处理');
        }

        console.log('✅ 平仓完成并已确认');
      } else {
        // 完美对冲，检查数量是否匹配
        if (Math.abs(edgexPos) > 0.0001 && Math.abs(paradexPos) > 0.0001 &&
            Math.abs(Math.abs(edgexPos) - Math.abs(paradexPos)) < 0.0001) {
          // 确定方向
          const direction = edgexPos > 0 ? 'buy_edgex_sell_paradex' : 'sell_edgex_buy_paradex';

          // 恢复内存状态（简化版，实际应该从交易历史恢复）
          this.currentPosition = {
            id: `recovered_${Date.now()}`,
            direction,
            amount: Math.abs(edgexPos),
            edgexPrice: 0,  // 无法获取历史价格
            paradexPrice: 0,
            edgexFee: 0,
            paradexFee: 0,
            openTime: Date.now(),
            openSpread: 9999  // 设置极大值防止自动平仓，需手动处理
          };

          console.log(`✅ 已恢复对冲持仓: ${Math.abs(edgexPos)} BTC`);
        }
      }
    } catch (error: any) {
      console.error('❌ 持仓同步失败:', error.message);
    }
  }

  /**
   * 初始化（启动 Python 服务）
   */
  async initialize(): Promise<void> {
    await this.executor.initialize();
    await this.syncPositionsOnStartup();
  }

  /**
   * 检查是否有持仓
   */
  async hasOpenPositions(): Promise<boolean> {
    return this.currentPosition !== null;
  }

  /**
   * 获取当前持仓信息
   */
  getCurrentPosition(): Position | null {
    return this.currentPosition;
  }

  /**
   * 开仓
   * @param triggerSpread 触发价差（用于准确性监控）
   */
  async openPosition(
    direction: 'buy_edgex_sell_paradex' | 'sell_edgex_buy_paradex',
    amount: number,
    triggerSpread?: number  // ✅ 添加触发价差参数
  ): Promise<{ success: boolean; error?: string; id?: string }> {
    try {
      let edgexResult: OrderResult;
      let paradexResult: OrderResult;

      // ✅ 并发下单（同时执行，像 AsterDx-Backpack）
      if (direction === 'buy_edgex_sell_paradex') {
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

      // ⚠️ 部分成功的情况 - 不自动回滚，报警让用户手动处理
      if (!edgexResult.success && paradexResult.success) {
        console.error('🚨 EdgeX 失败但 Paradex 成功！');
        console.error(`   EdgeX 错误: ${edgexResult.error}`);
        console.error(`   Paradex 已成交: ${amount} BTC`);
        console.error('⚠️  请立即手动平仓 Paradex 持仓！');
        return { success: false, error: `EdgeX失败: ${edgexResult.error}，Paradex已成交，需手动处理` };
      }

      if (edgexResult.success && !paradexResult.success) {
        console.error('🚨 Paradex 失败但 EdgeX 成功！');
        console.error(`   Paradex 错误: ${paradexResult.error}`);
        console.error(`   EdgeX 已成交: ${amount} BTC`);
        console.error('⚠️  请立即手动平仓 EdgeX 持仓！');
        return { success: false, error: `Paradex失败: ${paradexResult.error}，EdgeX已成交，需手动处理` };
      }

      // 验证两边都成交
      if (!edgexResult.success || !paradexResult.success) {
        console.error('❌ 开仓失败: 双边订单都未成交');
        console.error('   EdgeX:', edgexResult.error);
        console.error('   Paradex:', paradexResult.error);
        return { success: false, error: '双边订单都未成交' };
      }

      // 获取成交数据
      const edgexFilled = edgexResult.fillData?.fillSize || 0;
      const paradexFilled = paradexResult.fillData?.size || 0;
      const edgexPrice = edgexResult.fillData?.fillPrice || 0;
      const paradexPrice = paradexResult.fillData?.price || 0;
      const edgexFee = edgexResult.fillData?.fillFee || 0;
      const paradexFee = paradexResult.fillData?.fee || 0;

      // 验证成交数量一致
      if (Math.abs(edgexFilled - paradexFilled) > 0.0001) {
        console.error(`❌ 成交数量不一致: EdgeX ${edgexFilled}, Paradex ${paradexFilled}`);
        return { success: false, error: '成交数量不一致' };
      }

      // ✅ 价差准确性监控
      if (triggerSpread !== undefined) {
        const actualSpread = direction === 'buy_edgex_sell_paradex'
          ? paradexPrice - edgexPrice  // 买EdgeX卖Paradex: Paradex价格 - EdgeX价格
          : edgexPrice - paradexPrice; // 卖EdgeX买Paradex: EdgeX价格 - Paradex价格

        const spreadDiff = Math.abs(actualSpread - triggerSpread);

        // 导入配置阈值
        const { SPREAD_ACCURACY_WARN_THRESHOLD, SPREAD_ACCURACY_ERROR_THRESHOLD } =
          await import('../edgex-paradex-config.js');

        if (spreadDiff > SPREAD_ACCURACY_ERROR_THRESHOLD) {
          console.error(`🚨 价差差异过大: 触发 $${triggerSpread.toFixed(2)} vs 实际 $${actualSpread.toFixed(2)} (差异 $${spreadDiff.toFixed(2)})`);
        } else if (spreadDiff > SPREAD_ACCURACY_WARN_THRESHOLD) {
          console.warn(`⚠️  价差有偏差: 触发 $${triggerSpread.toFixed(2)} vs 实际 $${actualSpread.toFixed(2)} (差异 $${spreadDiff.toFixed(2)})`);
        } else {
          console.log(`✅ 价差准确: 触发 $${triggerSpread.toFixed(2)} vs 实际 $${actualSpread.toFixed(2)} (差异 $${spreadDiff.toFixed(2)})`);
        }
      }

      // 记录到交易历史（获取trade ID）
      const tradeId = tradeHistoryEdgexParadex.recordOpen({
        direction,
        amount: edgexFilled,
        edgexPrice,
        paradexPrice,
        edgexFee,
        paradexFee,
        timestamp: Date.now()
      });

      // 保存持仓到内存
      this.currentPosition = {
        id: tradeId,
        direction,
        amount: edgexFilled,
        edgexPrice,
        paradexPrice,
        edgexFee,
        paradexFee,
        openTime: Date.now(),
        openSpread: triggerSpread || Math.abs(edgexPrice - paradexPrice)  // 使用触发价差或实际价差
      };

      console.log(`✅ 开仓成功 | EdgeX: $${edgexPrice.toFixed(2)} | Paradex: $${paradexPrice.toFixed(2)} | ${edgexFilled} BTC`);

      return { success: true, id: tradeId };

    } catch (error: any) {
      console.error('❌ 开仓异常:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 平仓所有持仓
   */
  async closeAllPositions(): Promise<boolean> {
    // 🔧 简单判断：正在平仓中，直接返回
    if (this.isClosing) {
      return false;
    }

    if (!this.currentPosition) {
      return false;
    }

    // 🔧 设置平仓标志
    this.isClosing = true;

    try {
      let edgexResult: OrderResult;
      let paradexResult: OrderResult;

      // ✅ 并发平仓（同时执行）
      if (this.currentPosition.direction === 'buy_edgex_sell_paradex') {
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
        this.isClosing = false;  // 🔧 重置标志
        return false;
      }

      // 获取平仓价格和手续费
      const edgexClosePrice = edgexResult.fillData?.fillPrice || 0;
      const paradexClosePrice = paradexResult.fillData?.price || 0;
      const edgexCloseFee = edgexResult.fillData?.fillFee || 0;
      const paradexCloseFee = paradexResult.fillData?.fee || 0;

      // 记录平仓到交易历史
      tradeHistoryEdgexParadex.recordClose({
        id: this.currentPosition.id,
        edgexClosePrice,
        paradexClosePrice,
        edgexCloseFee,
        paradexCloseFee,
        timestamp: Date.now()
      });

      console.log(`✅ 平仓成功 | EdgeX: $${edgexClosePrice.toFixed(2)} | Paradex: $${paradexClosePrice.toFixed(2)}`);

      // ✅ 等待 2 秒后确认持仓是否真的清空了
      console.log('⏳ 确认平仓...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const edgexPosAfter = await this.getEdgeXPosition();
      const paradexPosAfter = await this.getParadexPosition();

      if (Math.abs(edgexPosAfter) > 0.0001 || Math.abs(paradexPosAfter) > 0.0001) {
        console.error(`⚠️  平仓后仍有持仓！EdgeX: ${edgexPosAfter}, Paradex: ${paradexPosAfter}`);
        console.error(`⚠️  不清空 currentPosition，等待下次平仓`);
        this.isClosing = false;  // 🔧 重置标志
        return false;
      }

      // 清空持仓记录
      this.currentPosition = null;
      this.isClosing = false;  // 🔧 重置标志
      return true;

    } catch (error: any) {
      console.error('❌ 平仓异常:', error.message);
      this.isClosing = false;  // 🔧 重置标志
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
   * 监听价格更新事件
   */
  on(event: string, callback: (...args: any[]) => void): void {
    this.executor.on(event, callback);
  }
}

// ==================== 导出 ====================

export default SimpleTraderEdgexParadex;
