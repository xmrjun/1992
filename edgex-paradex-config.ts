/**
 * EdgeX-Paradex 套利交易配置
 * 使用多层次加权价差计算算法
 */

// ==================== 交易对配置 ====================

export const EDGEX_SYMBOL = "BTC/USD:USD";      // EdgeX 合约格式
export const PARADEX_SYMBOL = "BTC-USD-PERP";   // Paradex 合约格式

// ==================== 交易规模设置 ====================

export const TRADE_AMOUNT = 0.01;               // 每次交易：0.01 BTC（适配5档深度）
export const LEVERAGE = 5;                      // 5倍杠杆

// ==================== 价差计算参数 ====================
// ✅ 优化为更激进的套利策略

export const MIN_OPEN_SPREAD = 150;             // 最小开仓价差 150 USD（扣除成本后净利润）
export const MAX_OPEN_SPREAD = 300;             // 最大开仓价差 300 USD（流动性检查）
export const MAX_UNWIND_SPREAD = 150;           // 最大反向平仓价差 150 USD

export const MAX_SYMMETRY_DIFF = 50;            // 双向价差对称性检查 50 USD
export const MIN_COOLDOWN = 3000;               // 最小冷却时间 3 秒 (参考 1991: 更快)
export const FAILURE_COOLDOWN = 10000;          // 失败后冷却时间 10 秒 (参考 1991: 更快恢复)

// ==================== EMA 平滑参数 ====================

export const EMA_ALPHA = 0.35;                  // EMA 平滑系数 (0-1)

// ==================== 开仓决策评分参数 ====================

export const HYSTERESIS_BONUS = 5;              // 同方向连续开仓奖励分 5 USD
export const UNWIND_PENALTY = 15;               // 反向平仓惩罚 15 USD

// ==================== 平仓参数 ====================

export const CLOSE_SPREAD_THRESHOLD = 50;       // 平仓价差阈值 50 USD

// ==================== 交易频率控制 ====================
// ✅ 参照 1991 bot 优化检查频率

export const TRADE_INTERVAL = 100;              // 100ms 检查一次 (参考 1991: 50ms，保持平衡)
export const MIN_TRADE_INTERVAL = 100;          // 最小交易间隔 100ms (参考 1991: 100ms)

// ==================== 风险控制 ====================

export const MAX_POSITION_COUNT = 1;            // 最大持仓数量
export const DAILY_LOSS_LIMIT = 200;            // 日亏损限制 200 USD (参考 1991: 200 USD)
export const FORCE_CLOSE_TIME = 30 * 60 * 1000; // 30分钟强制平仓 (参考 1991: 30分钟)

// ==================== 交易所精度配置 ====================

export const EDGEX_CONFIG = {
  name: 'EdgeX',
  symbol: EDGEX_SYMBOL,
  contractId: '10000001',                       // BTC-USD-PERP 合约ID
  precision: {
    amount: 3,                                  // 数量精度 3位小数
    price: 2                                    // 价格精度 2位小数
  },
  limits: {
    amount: { min: 0.001, max: 1000 },
    price: { min: 1, max: 200000 }
  }
};

export const PARADEX_CONFIG = {
  name: 'Paradex',
  symbol: PARADEX_SYMBOL,
  precision: {
    amount: 3,
    price: 2
  },
  limits: {
    amount: { min: 0.001, max: 1000 },
    price: { min: 1, max: 200000 }
  }
};

// ==================== 数据有效性检查 ====================

export const MAX_DATA_AGE = 3000;               // 最大数据年龄 3 秒
export const MIN_ORDERBOOK_LEVELS = 20;         // 最少订单簿层数 20

// ==================== 日志控制 ====================

export const ENABLE_DEBUG_LOG = false;          // 禁用调试日志 (减少刷屏)
export const LOG_SPREAD_DETAILS = false;        // 禁用价差计算细节日志
export const LOG_PRICE_UPDATES = false;         // 禁用价格更新日志（太频繁）

// ==================== 价差准确性监控 ====================
// ✅ 监控触发价差 vs 实际成交价差的差异

export const ENABLE_SPREAD_ACCURACY_MONITORING = true;  // 启用价差准确性监控
export const SPREAD_ACCURACY_WARN_THRESHOLD = 30;       // 价差差异警告阈值 30 USD
export const SPREAD_ACCURACY_ERROR_THRESHOLD = 60;      // 价差差异错误阈值 60 USD
