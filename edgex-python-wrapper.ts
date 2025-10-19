import { spawn } from 'child_process';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '.env.edgex' });

interface EdgeXBalance {
  success: boolean;
  totalEquity?: string;
  availableBalance?: string;
  positionCount?: number;
  error?: string;
  raw?: any;
}

interface EdgeXPosition {
  userId: string;
  accountId: string;
  coinId: string;
  contractId: string;
  openSize: string;
  openValue: string;
  openFee: string;
  fundingFee: string;
}

interface EdgeXPositions {
  success: boolean;
  positions?: EdgeXPosition[];
  count?: number;
  error?: string;
  raw?: any;
}

/**
 * 调用Python EdgeX客户端
 */
async function callPythonClient(command: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', ['/root/aster-bot/edgex_client.py', command], {
      env: {
        ...process.env,
        EDGEX_BASE_URL: process.env.EDGEX_BASE_URL || 'https://pro.edgex.exchange',
        EDGEX_ACCOUNT_ID: process.env.EDGEX_ACCOUNT_ID || '662340834011644921',
        EDGEX_STARK_PRIVATE_KEY: process.env.EDGEX_STARK_PRIVATE_KEY || ''
      }
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python client exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse JSON: ${stdout}`));
      }
    });
  });
}

/**
 * EdgeX Python SDK Wrapper
 */
export class EdgeXPythonClient {
  /**
   * 获取账户余额
   */
  async getBalance(): Promise<EdgeXBalance> {
    return await callPythonClient('balance');
  }

  /**
   * 获取持仓
   */
  async getPositions(): Promise<EdgeXPositions> {
    return await callPythonClient('positions');
  }

  /**
   * 获取元数据
   */
  async getMetadata(): Promise<any> {
    return await callPythonClient('metadata');
  }
}

// 测试代码
async function test() {
  const client = new EdgeXPythonClient();

  console.log('🧪 EdgeX Python SDK Wrapper 测试');
  console.log('='.repeat(50));

  // 测试余额
  console.log('\n📊 测试 1: 获取账户余额');
  console.log('-'.repeat(50));
  const balance = await client.getBalance();
  if (balance.success) {
    console.log(`✅ 总权益: ${balance.totalEquity} USDC`);
    console.log(`   可用余额: ${balance.availableBalance} USDC`);
    console.log(`   持仓数量: ${balance.positionCount}`);
  } else {
    console.log(`❌ 错误: ${balance.error}`);
  }

  // 测试持仓
  console.log('\n📊 测试 2: 获取持仓信息');
  console.log('-'.repeat(50));
  const positions = await client.getPositions();
  if (positions.success && positions.positions) {
    console.log(`✅ 持仓数量: ${positions.count}`);
    for (const pos of positions.positions) {
      console.log(`   合约ID: ${pos.contractId}, 仓位: ${pos.openSize}, 开仓价值: ${pos.openValue}`);
    }
  } else {
    console.log(`❌ 错误: ${positions.error}`);
  }

  // 测试元数据
  console.log('\n📊 测试 3: 获取交易所元数据');
  console.log('-'.repeat(50));
  const metadata = await client.getMetadata();
  if (metadata.success) {
    console.log(`✅ 合约数量: ${metadata.count}`);
    console.log(`   前3个合约ID: ${metadata.contracts.slice(0, 3).map((c: any) => c.contractId).join(', ')}`);
  } else {
    console.log(`❌ 错误: ${metadata.error}`);
  }

  console.log('\n🎉 测试完成！');
}

// 如果直接运行此文件，执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  test().catch(console.error);
}
