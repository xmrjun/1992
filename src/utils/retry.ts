/**
 * 智能重试工具
 * - 指数退避
 * - 可配置最大重试次数
 * - 区分可重试错误和致命错误
 */

export interface RetryConfig {
  maxRetries: number;           // 最大重试次数
  initialDelay: number;         // 初始延迟（毫秒）
  maxDelay: number;             // 最大延迟（毫秒）
  backoffMultiplier: number;    // 退避倍数
  retryableErrors?: string[];   // 可重试的错误关键词
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,           // 1秒
  maxDelay: 10000,              // 10秒
  backoffMultiplier: 2,
  retryableErrors: [
    'timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'network',
    '429',                      // Rate limit
    '502',                      // Bad Gateway
    '503',                      // Service Unavailable
    '504',                      // Gateway Timeout
  ],
};

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: any, config: RetryConfig): boolean {
  if (!error) return false;

  const errorMessage = error.message || error.toString();
  const errorCode = error.code || '';

  // 检查错误消息或代码是否包含可重试关键词
  const retryableKeywords = config.retryableErrors || DEFAULT_RETRY_CONFIG.retryableErrors || [];

  return retryableKeywords.some(keyword =>
    errorMessage.toLowerCase().includes(keyword.toLowerCase()) ||
    errorCode.toLowerCase().includes(keyword.toLowerCase())
  );
}

/**
 * 带指数退避的重试函数
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: string
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;
  let delay = finalConfig.initialDelay;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      // 执行函数
      return await fn();
    } catch (error: any) {
      lastError = error;

      // 如果是最后一次尝试，或者错误不可重试，直接抛出
      if (attempt === finalConfig.maxRetries || !isRetryableError(error, finalConfig)) {
        if (!isRetryableError(error, finalConfig)) {
          console.error(`❌ ${context || '操作'} 失败（不可重试）: ${error.message}`);
        } else {
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
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,        // 失败阈值
    private timeout: number = 60000,      // 熔断超时（毫秒）
    private resetTimeout: number = 30000  // 重置超时（毫秒）
  ) {}

  /**
   * 执行操作（带熔断保护）
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    // 检查熔断器状态
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;

      if (timeSinceLastFailure > this.resetTimeout) {
        // 尝试半开状态
        this.state = 'half-open';
        console.log(`🔄 ${context || '熔断器'} 进入半开状态，尝试恢复...`);
      } else {
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
    } catch (error: any) {
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
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * 获取当前状态
   */
  getState(): { state: string; failureCount: number; lastFailureTime: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

// 导出熔断器实例（EdgeX 和 Paradex 各一个）
export const edgexCircuitBreaker = new CircuitBreaker(5, 60000, 30000);
export const paradexCircuitBreaker = new CircuitBreaker(5, 60000, 30000);
