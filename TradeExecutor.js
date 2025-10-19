/**
 * 交易执行模块
 * 负责调用 Python 服务执行交易并获取成交确认
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { withRetry, edgexCircuitBreaker, paradexCircuitBreaker } from './utils/retry.js';
export class TradeExecutor extends EventEmitter {
    constructor() {
        super();
        this.edgexProcess = null;
        this.paradexProcess = null;
        this.edgexReady = false;
        this.paradexReady = false;
        this.commandId = 0;
        this.commandCallbacks = new Map();
    }
    /**
     * 初始化交易服务
     */
    async initialize() {
        console.log('🚀 初始化交易执行服务...');
        // 启动 EdgeX 服务
        await this.startEdgeXService();
        // 启动 Paradex 服务
        await this.startParadexService();
        console.log('✅ 交易执行服务初始化完成\n');
    }
    /**
     * 启动 EdgeX 交易服务
     */
    async startEdgeXService() {
        return new Promise((resolve, reject) => {
            console.log('🔧 启动 EdgeX 交易服务...');
            const env = {
                ...process.env,
                EDGEX_ACCOUNT_ID: process.env.EDGEX_ACCOUNT_ID,
                EDGEX_STARK_PRIVATE_KEY: process.env.EDGEX_STARK_PRIVATE_KEY,
                EDGEX_BASE_URL: process.env.EDGEX_BASE_URL || 'https://pro.edgex.exchange',
            };
            this.edgexProcess = spawn('python3', ['edgex_trading_service.py'], {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            let timeout;
            this.edgexProcess.stdout?.on('data', (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                lines.forEach(line => {
                    try {
                        const message = JSON.parse(line);
                        this.handleEdgeXMessage(message);
                        if (message.type === 'ready' && !this.edgexReady) {
                            this.edgexReady = true;
                            if (timeout)
                                clearTimeout(timeout);
                            console.log('✅ EdgeX 服务就绪');
                            resolve();
                        }
                    }
                    catch (error) {
                        // 非 JSON 行，忽略
                    }
                });
            });
            this.edgexProcess.stderr?.on('data', (data) => {
                const log = data.toString();
                if (log.includes('ERROR') || log.includes('✅') || log.includes('🚀')) {
                    console.log('[EdgeX]', log.trim());
                }
            });
            this.edgexProcess.on('error', (error) => {
                console.error('❌ EdgeX 服务错误:', error);
                reject(error);
            });
            timeout = setTimeout(() => {
                reject(new Error('EdgeX 服务启动超时'));
            }, 30000);
        });
    }
    /**
     * 启动 Paradex 交易服务
     */
    async startParadexService() {
        return new Promise((resolve, reject) => {
            console.log('🔧 启动 Paradex 交易服务...');
            const env = {
                ...process.env,
                PARADEX_L2_ADDRESS: process.env.PARADEX_L2_ADDRESS,
                PARADEX_L2_PRIVATE_KEY: process.env.PARADEX_L2_PRIVATE_KEY,
                PARADEX_TESTNET: process.env.PARADEX_TESTNET || 'false',
                PARADEX_MARKET: 'BTC-USD-PERP',
            };
            this.paradexProcess = spawn('python3', ['paradex_ws_service.py'], {
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            let timeout;
            this.paradexProcess.stdout?.on('data', (data) => {
                const lines = data.toString().split('\n').filter(line => line.trim());
                lines.forEach(line => {
                    try {
                        const message = JSON.parse(line);
                        this.handleParadexMessage(message);
                        if (message.type === 'ready' && !this.paradexReady) {
                            this.paradexReady = true;
                            if (timeout)
                                clearTimeout(timeout);
                            console.log('✅ Paradex 服务就绪');
                            resolve();
                        }
                    }
                    catch (error) {
                        // 非 JSON 行，忽略
                    }
                });
            });
            this.paradexProcess.stderr?.on('data', (data) => {
                const log = data.toString();
                if (log.includes('ERROR') || log.includes('✅') || log.includes('🚀')) {
                    console.log('[Paradex]', log.trim());
                }
            });
            this.paradexProcess.on('error', (error) => {
                console.error('❌ Paradex 服务错误:', error);
                reject(error);
            });
            timeout = setTimeout(() => {
                reject(new Error('Paradex 服务启动超时'));
            }, 30000);
        });
    }
    /**
     * 处理 EdgeX 消息
     */
    handleEdgeXMessage(message) {
        if (message.type === 'command_result') {
            const callback = this.commandCallbacks.get(message.data.id);
            if (callback) {
                this.commandCallbacks.delete(message.data.id);
                callback(message.data);
            }
        }
        else if (message.type === 'price_update') {
            this.emit('edgex_price', message.data);
        }
    }
    /**
     * 处理 Paradex 消息
     */
    handleParadexMessage(message) {
        if (message.type === 'command_result') {
            const callback = this.commandCallbacks.get(message.data.id);
            if (callback) {
                this.commandCallbacks.delete(message.data.id);
                callback(message.data);
            }
        }
        else if (message.type === 'price_update') {
            this.emit('paradex_price', message.data);
        }
    }
    /**
     * 发送命令到 EdgeX
     */
    async sendEdgeXCommand(action, params) {
        return new Promise((resolve, reject) => {
            if (!this.edgexProcess || !this.edgexProcess.stdin) {
                reject(new Error('EdgeX 服务未运行'));
                return;
            }
            const id = `edgex_${++this.commandId}`;
            const command = { id, action, params };
            const timeout = setTimeout(() => {
                this.commandCallbacks.delete(id);
                reject(new Error(`EdgeX 命令超时: ${action}`));
            }, 30000);
            this.commandCallbacks.set(id, (result) => {
                clearTimeout(timeout);
                if (result.success) {
                    resolve(result.data);
                }
                else {
                    reject(new Error(result.error || 'EdgeX 命令执行失败'));
                }
            });
            this.edgexProcess.stdin.write(JSON.stringify(command) + '\n');
        });
    }
    /**
     * 发送命令到 Paradex
     */
    async sendParadexCommand(action, params) {
        return new Promise((resolve, reject) => {
            if (!this.paradexProcess || !this.paradexProcess.stdin) {
                reject(new Error('Paradex 服务未运行'));
                return;
            }
            const id = `paradex_${++this.commandId}`;
            const command = { id, action, params };
            const timeout = setTimeout(() => {
                this.commandCallbacks.delete(id);
                reject(new Error(`Paradex 命令超时: ${action}`));
            }, 30000);
            this.commandCallbacks.set(id, (result) => {
                clearTimeout(timeout);
                if (result.success) {
                    resolve(result.data);
                }
                else {
                    reject(new Error(result.error || 'Paradex 命令执行失败'));
                }
            });
            this.paradexProcess.stdin.write(JSON.stringify(command) + '\n');
        });
    }
    /**
     * 获取 EdgeX 当前价格
     */
    async getEdgeXPrice() {
        try {
            const result = await this.sendEdgeXCommand('get_price', {
                contract_id: '10000001', // BTC-USD-PERP (我们交易的合约)
            });
            return result;
        }
        catch (error) {
            console.error(`❌ EdgeX 获取价格失败:`, error.message);
            throw error;
        }
    }
    /**
     * 获取 Paradex 当前价格
     */
    async getParadexPrice() {
        try {
            const result = await this.sendParadexCommand('get_price', {
                market: 'BTC-USD-PERP',
            });
            return result;
        }
        catch (error) {
            console.error(`❌ Paradex 获取价格失败:`, error.message);
            throw error;
        }
    }
    /**
     * EdgeX 下单（带智能重试和熔断保护）
     */
    async placeEdgeXOrder(side, amount) {
        try {
            console.log(`📝 EdgeX 下单: ${side.toUpperCase()} ${amount} BTC`);
            // ✅ 使用熔断器和重试机制
            const result = await edgexCircuitBreaker.execute(async () => {
                return await withRetry(async () => {
                    const cmdResult = await this.sendEdgeXCommand('create_order', {
                        side: side.toUpperCase(),
                        size: amount.toString(),
                        type: 'MARKET',
                    });
                    // 检查是否有成交数据
                    if (!cmdResult.fill || !cmdResult.fill.filled) {
                        throw new Error('EdgeX 订单未成交');
                    }
                    return cmdResult;
                }, {
                    maxRetries: 2,
                    initialDelay: 500,
                    maxDelay: 2000,
                }, 'EdgeX 下单');
            }, 'EdgeX');
            // 处理成交数据
            const fillData = {
                id: result.fill.fillId,
                orderId: result.data.orderId,
                fillPrice: parseFloat(result.fill.fillPrice),
                fillSize: parseFloat(result.fill.fillSize),
                fillValue: parseFloat(result.fill.fillValue),
                fillFee: parseFloat(result.fill.fillFee),
                realizePnl: parseFloat(result.fill.realizePnl),
                direction: result.fill.direction,
                createdTime: Date.now(),
            };
            console.log(`✅ EdgeX 成交: $${fillData.fillPrice}, 手续费: $${fillData.fillFee}`);
            return {
                success: true,
                orderId: result.data.orderId,
                fillData,
            };
        }
        catch (error) {
            console.error(`❌ EdgeX 下单失败:`, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Paradex 下单（带智能重试和熔断保护）
     */
    async placeParadexOrder(side, amount) {
        try {
            console.log(`📝 Paradex 下单: ${side.toUpperCase()} ${amount} BTC`);
            // ✅ 使用熔断器和重试机制
            const result = await paradexCircuitBreaker.execute(async () => {
                return await withRetry(async () => {
                    const cmdResult = await this.sendParadexCommand('create_order', {
                        side: side.toUpperCase(),
                        size: amount.toString(),
                        type: 'MARKET',
                    });
                    // 检查是否有成交数据
                    if (!cmdResult.fill || !cmdResult.fill.filled) {
                        throw new Error('Paradex 订单未成交');
                    }
                    return cmdResult;
                }, {
                    maxRetries: 2,
                    initialDelay: 500,
                    maxDelay: 2000,
                }, 'Paradex 下单');
            }, 'Paradex');
            // 处理成交数据
            const fillData = {
                id: result.fill.fillId,
                order_id: result.id,
                price: parseFloat(result.fill.fillPrice),
                size: parseFloat(result.fill.fillSize),
                fee: parseFloat(result.fill.fillFee),
                realized_pnl: parseFloat(result.fill.realizePnl || 0),
                realized_funding: 0,
                liquidity: result.fill.liquidity,
                created_at: Date.now(),
            };
            console.log(`✅ Paradex 成交: $${fillData.price}, 手续费: $${fillData.fee}`);
            return {
                success: true,
                orderId: result.id,
                fillData,
            };
        }
        catch (error) {
            console.error(`❌ Paradex 下单失败:`, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * 关闭服务
     */
    async close() {
        console.log('\n🔌 关闭交易服务...');
        if (this.edgexProcess) {
            this.edgexProcess.kill('SIGTERM');
            this.edgexProcess = null;
        }
        if (this.paradexProcess) {
            this.paradexProcess.kill('SIGTERM');
            this.paradexProcess = null;
        }
        console.log('✅ 交易服务已关闭');
    }
}
