#!/usr/bin/env node
/**
 * 快速查询 EdgeX 和 Paradex 持仓
 */

import { createRequire } from 'module';
import * as dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const { TradeExecutor } = require('./TradeExecutor.js');

// 加载环境变量
dotenv.config({ path: '/root/aster-bot/.env.edgex' });
dotenv.config({ path: '/root/aster-bot/.env.paradex' });

class PositionChecker {
  private executor: any;

  constructor() {
    this.executor = new TradeExecutor();
  }

  async initialize(): Promise<void> {
    await this.executor.initialize();
  }

  /**
   * 查询 EdgeX 持仓
   */
  async getEdgeXPosition(): Promise<any> {
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
          resolve(result.data);
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
  async getParadexPosition(): Promise<any> {
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
          resolve(result.data);
        } else {
          reject(new Error(result.error || 'Paradex 持仓查询失败'));
        }
      });

      this.executor.paradexProcess.stdin.write(JSON.stringify(command) + '\n');
    });
  }

  async close(): Promise<void> {
    await this.executor.close();
  }
}

// ==================== 主程序 ====================

async function main() {
  const checker = new PositionChecker();

  try {
    console.log('🔌 初始化连接...\n');
    await checker.initialize();

    console.log('📊 查询持仓信息...\n');

    // 查询 EdgeX 持仓
    try {
      const edgexPos = await checker.getEdgeXPosition();
      console.log('📈 EdgeX (BTC-USD-PERP):');
      console.log(`   持仓: ${edgexPos.position > 0 ? '+' : ''}${edgexPos.position} BTC`);
      console.log(`   方向: ${edgexPos.side || 'FLAT'}`);
      console.log(`   数量: ${edgexPos.size} BTC`);
      console.log(`   入场价: $${edgexPos.entry_price.toFixed(2)}`);
      console.log(`   浮动盈亏: $${edgexPos.unrealized_pnl.toFixed(4)}`);
    } catch (error: any) {
      console.error('❌ EdgeX 持仓查询失败:', error.message);
    }

    console.log('');

    // 查询 Paradex 持仓
    try {
      const paradexPos = await checker.getParadexPosition();
      console.log('📈 Paradex (BTC-USD-PERP):');
      console.log(`   持仓: ${paradexPos.position > 0 ? '+' : ''}${paradexPos.position} BTC`);
      console.log(`   入场价: $${paradexPos.entry_price?.toFixed(2) || '0.00'}`);
      console.log(`   浮动盈亏: $${paradexPos.unrealized_pnl?.toFixed(4) || '0.0000'}`);
    } catch (error: any) {
      console.error('❌ Paradex 持仓查询失败:', error.message);
    }

    console.log('\n✅ 查询完成');

  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  } finally {
    await checker.close();
    process.exit(0);
  }
}

main();
