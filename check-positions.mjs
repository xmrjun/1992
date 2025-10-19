/**
 * Check actual positions on both exchanges
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { TradeExecutor } = require('./TradeExecutor.js');

async function checkPositions() {
  const executor = new TradeExecutor();

  try {
    console.log('🔌 初始化交易执行器...');
    await executor.initialize();

    // Wait for connections
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n📊 查询交易所持仓...\n');

    // Query EdgeX position
    const edgexPos = await new Promise((resolve, reject) => {
      const id = `edgex_pos_${Date.now()}`;
      const command = {
        id,
        action: 'get_position',
        params: { contract_id: '10000001' }
      };

      const timeout = setTimeout(() => {
        executor.commandCallbacks.delete(id);
        reject(new Error('EdgeX 持仓查询超时'));
      }, 10000);

      executor.commandCallbacks.set(id, (result) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve(result.data.position || 0);
        } else {
          reject(new Error(result.error || 'EdgeX 持仓查询失败'));
        }
      });

      executor.edgexProcess.stdin.write(JSON.stringify(command) + '\n');
    });

    // Query Paradex position
    const paradexPos = await new Promise((resolve, reject) => {
      const id = `paradex_pos_${Date.now()}`;
      const command = {
        id,
        action: 'get_position',
        params: { market: 'BTC-USD-PERP' }
      };

      const timeout = setTimeout(() => {
        executor.commandCallbacks.delete(id);
        reject(new Error('Paradex 持仓查询超时'));
      }, 10000);

      executor.commandCallbacks.set(id, (result) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve(result.data.position || 0);
        } else {
          reject(new Error(result.error || 'Paradex 持仓查询失败'));
        }
      });

      executor.paradexProcess.stdin.write(JSON.stringify(command) + '\n');
    });

    console.log(`EdgeX 持仓:   ${edgexPos > 0 ? '+' : ''}${edgexPos.toFixed(4)} BTC`);
    console.log(`Paradex 持仓: ${paradexPos > 0 ? '+' : ''}${paradexPos.toFixed(4)} BTC`);
    console.log(`总持仓偏差:   ${Math.abs(edgexPos + paradexPos).toFixed(4)} BTC`);

    if (Math.abs(edgexPos + paradexPos) < 0.0001) {
      console.log('\n✅ 持仓完美对冲');
    } else {
      console.log('\n⚠️  持仓不对冲，存在风险敞口');
    }

    await executor.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ 错误:', error.message);
    await executor.close();
    process.exit(1);
  }
}

checkPositions();
