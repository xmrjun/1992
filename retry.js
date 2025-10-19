"use strict";
/**
 * 智能重试工具
 * - 指数退避
 * - 可配置最大重试次数
 * - 区分可重试错误和致命错误
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.paradexCircuitBreaker = exports.edgexCircuitBreaker = exports.DEFAULT_RETRY_CONFIG = void 0;
exports.withRetry = withRetry;
exports.DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    initialDelay: 1000, // 1秒
    maxDelay: 10000, // 10秒
    backoffMultiplier: 2,
    retryableErrors: [
        'timeout',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'network',
        '429', // Rate limit
        '502', // Bad Gateway
        '503', // Service Unavailable
        '504', // Gateway Timeout
    ],
};
/**
 * 判断错误是否可重试
 */
function isRetryableError(error, config) {
    if (!error)
        return false;
    const errorMessage = error.message || error.toString();
    const errorCode = error.code || '';
    // 检查错误消息或代码是否包含可重试关键词
    const retryableKeywords = config.retryableErrors || exports.DEFAULT_RETRY_CONFIG.retryableErrors || [];
    return retryableKeywords.some(keyword => errorMessage.toLowerCase().includes(keyword.toLowerCase()) ||
        errorCode.toLowerCase().includes(keyword.toLowerCase()));
}
/**
 * 带指数退避的重试函数
 */
async function withRetry(fn, config = {}, context) {
    const finalConfig = { ...exports.DEFAULT_RETRY_CONFIG, ...config };
    let lastError;
    let delay = finalConfig.initialDelay;
    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
        try {
            // 执行函数
            return await fn();
        }
        catch (error) {
            lastError = error;
            // 如果是最后一次尝试，或者错误不可重试，直接抛出
            if (attempt === finalConfig.maxRetries || !isRetryableError(error, finalConfig)) {
                if (!isRetryableError(error, finalConfig)) {
                    console.error(`❌ ${context || '操作'} 失败（不可重试）: ${error.message}`);
                }
                else {
                    console.error(`❌ ${context || '操作'} 失败（已达最大重试次数）: ${error.message}`);
                }
                throw error;
            }
            // 记录重试
            console.warn(`⚠️  ${context || '操作'} 失败，${delay}ms 后重试 (${attempt + 1}/${finalConfig.maxRetries}): ${error.message}`);
            // 等待指数退避
            await new Promise(resolve => setTimeout(resolve, delay));
            // 计算下次延迟（指数增长，但不超过最大值）
            delay = Math.min(delay * finalConfig.backoffMultiplier, finalConfig.maxDelay);
        }
    }
    // 理论上不会到这里，但为了类型安全
    throw lastError;
}
/**
 * 熔断器状态
 */
class CircuitBreaker {
    constructor(threshold = 5, // 失败阈值
    timeout = 60000, // 熔断超时（毫秒）
    resetTimeout = 30000 // 重置超时（毫秒）
    ) {
        this.threshold = threshold;
        this.timeout = timeout;
        this.resetTimeout = resetTimeout;
        this.failureCount = 0;
        this.lastFailureTime = 0;
        this.state = 'closed';
    }
    /**
     * 执行操作（带熔断保护）
     */
    async execute(fn, context) {
        // 检查熔断器状态
        if (this.state === 'open') {
            const timeSinceLastFailure = Date.now() - this.lastFailureTime;
            if (timeSinceLastFailure > this.resetTimeout) {
                // 尝试半开状态
                this.state = 'half-open';
                console.log(`🔄 ${context || '熔断器'} 进入半开状态，尝试恢复...`);
            }
            else {
                throw new Error(`熔断器打开，拒绝请求（${Math.ceil((this.resetTimeout - timeSinceLastFailure) / 1000)}秒后重试）`);
            }
        }
        try {
            const result = await fn();
            // 成功，重置熔断器
            if (this.state === 'half-open') {
                this.state = 'closed';
                this.failureCount = 0;
                console.log(`✅ ${context || '熔断器'} 已关闭，恢复正常`);
            }
            return result;
        }
        catch (error) {
            this.failureCount++;
            this.lastFailureTime = Date.now();
            // 检查是否达到阈值
            if (this.failureCount >= this.threshold) {
                this.state = 'open';
                console.error(`🚨 ${context || '熔断器'} 打开！连续失败 ${this.failureCount} 次`);
            }
            throw error;
        }
    }
    /**
     * 手动重置熔断器
     */
    reset() {
        this.state = 'closed';
        this.failureCount = 0;
        this.lastFailureTime = 0;
    }
    /**
     * 获取当前状态
     */
    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
        };
    }
}
// 导出熔断器实例（EdgeX 和 Paradex 各一个）
exports.edgexCircuitBreaker = new CircuitBreaker(5, 60000, 30000);
exports.paradexCircuitBreaker = new CircuitBreaker(5, 60000, 30000);
