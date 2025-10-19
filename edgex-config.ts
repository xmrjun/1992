// EdgeX ↔ AsterDEX 交易配置
export const EDGEX_TRADE_SYMBOL = "BTC/USD:USD"; // EdgeX 合约格式
export const ASTER_TRADE_SYMBOL = "BTCUSDT"; // AsterDEX 格式
export const LEVERAGE = 5; // 5倍杠杆

// 交易规模设置 - 更新为0.02 BTC
export const TRADE_AMOUNT = 0.02; // 每次开仓：0.02 BTC

// 加仓策略参数
export const MAX_POSITION_SIZE = 0.05; // 最大持仓：0.05 BTC
export const MAX_ADD_POSITIONS = 4; // 最大加仓4次
export const ADD_POSITION_SPREAD = 5; // 每次加仓需要额外5U价差

// 开平仓参数 - 更新为$80开仓/$20平仓
export const ARB_THRESHOLD = 80; // 80U价差开仓
export const CLOSE_DIFF = 20; // 20U价差平仓
export const PROFIT_DIFF_LIMIT = 3; // 3U利润目标
export const LOSS_LIMIT = 0.3; // 30%止损
export const MAX_SPREAD = 150; // 最大价差限制150U

// 交易频率设置
export const TRADE_INTERVAL = 50; // 50ms检查一次
export const MIN_TRADE_INTERVAL = 100; // 最小交易间隔100ms

// 目标设置
export const DAILY_VOLUME_TARGET = Infinity; // 无交易量限制
export const DAILY_TRADES_TARGET = Infinity; // 无交易笔数限制

// 风险控制
export const MAX_POSITION_COUNT = 1; // 只做1个交易对
export const DAILY_LOSS_LIMIT = 100; // 日亏损限制100 USDT
export const FORCE_CLOSE_TIME = 30 * 60 * 1000; // 30分钟强制平仓

// 时间锁定参数 - 防止频繁开平仓
export const OPEN_LOCK_DURATION = 10; // 开仓后锁定10秒
export const CLOSE_LOCK_DURATION = 30; // 平仓后冷却30秒

// 动态参数
export const STOP_LOSS_DIST = 0.15; // 15%止损距离
export const TRAILING_PROFIT = 0.3; // 30%动态止盈
export const TRAILING_CALLBACK_RATE = 0.2; // 20%回撤比例

// WebSocket配置
export const USE_WEBSOCKET = true; // 启用WebSocket实时价格
export const WS_RECONNECT_INTERVAL = 5000; // 5秒重连间隔

// 交易所配置
export const EDGEX_CONFIG = {
  name: 'EdgeX',
  symbol: EDGEX_TRADE_SYMBOL,
  contractId: '10000001', // BTC-USD-PERP合约ID
  precision: {
    amount: 3,
    price: 2
  },
  limits: {
    amount: { min: 0.001, max: 1000 },
    price: { min: 1, max: 200000 }
  }
};

export const ASTER_CONFIG = {
  name: 'AsterDEX',
  symbol: ASTER_TRADE_SYMBOL,
  precision: {
    amount: 3,
    price: 2
  },
  limits: {
    amount: { min: 0.001, max: 1000 },
    price: { min: 1, max: 200000 }
  }
};