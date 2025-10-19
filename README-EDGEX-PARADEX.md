# EdgeX-Paradex 套利机器人

EdgeX和Paradex双交易所的自动化套利交易系统。

## 功能特点

- ✅ **双向套利**: 自动检测EdgeX和Paradex之间的价差机会
- ✅ **实时价格监控**: 通过WebSocket实时获取两个交易所的订单簿数据
- ✅ **自动开仓/平仓**: 当价差满足条件时自动执行套利交易
- ✅ **风险控制**: 包含持仓数量限制、亏损限制、强制平仓等安全机制
- ✅ **交易记录**: 自动记录所有交易历史和盈亏情况

## 系统架构

```
edgex-paradex-arb-bot.ts          # 主程序：价差监控和交易决策
├── utils/simple-trader-edgex-paradex.ts   # 交易执行器
├── TradeExecutor.js              # 订单执行（与Python服务通信）
├── edgex_trading_service.py      # EdgeX交易服务（Python）
└── paradex_ws_service.py         # Paradex WebSocket服务（Python）
```

## 配置参数

**文件**: `edgex-paradex-config.ts`

### 交易参数
- `TRADE_AMOUNT`: 每次交易数量 (0.01 BTC)
- `LEVERAGE`: 杠杆倍数 (5x)

### 价差阈值
- `MIN_OPEN_SPREAD`: 最小开仓价差 (150 USD)
- `CLOSE_SPREAD_THRESHOLD`: 平仓价差阈值 (50 USD)

### 风险控制
- `MAX_POSITION_COUNT`: 最大持仓数量 (1)
- `DAILY_LOSS_LIMIT`: 日亏损限制 (200 USD)
- `FORCE_CLOSE_TIME`: 强制平仓时间 (30分钟)

## 使用方法

### 1. 环境准备

创建环境变量文件 `.env.edgex` 和 `.env.paradex`:

```bash
# .env.edgex
EDGEX_API_KEY=your_api_key
EDGEX_PRIVATE_KEY=your_private_key
EDGEX_ACCOUNT_ID=your_account_id

# .env.paradex
PARADEX_PRIVATE_KEY=your_private_key
PARADEX_ACCOUNT_ADDRESS=your_address
```

### 2. 启动机器人

使用PM2管理进程：

```bash
# 启动
pm2 start pm2.config.cjs --only edgex-paradex-arb

# 查看日志
pm2 logs edgex-paradex-arb

# 停止
pm2 stop edgex-paradex-arb
```

### 3. 监控运行

机器人会每30秒输出状态汇总：

```
[时间] 📊 EdgeX: 119000.0/119000.5 | Paradex: 119150.0/119150.5 | 价差A: 149.5 | 价差B: -150.0
```

## 交易逻辑

### 开仓条件

**买EdgeX卖Paradex**:
- 价差A = `paradexBid - edgexAsk >= 150`
- 方向: `buy_edgex_sell_paradex`

**卖EdgeX买Paradex**:
- 价差B = `edgexBid - paradexAsk >= 150`
- 方向: `sell_edgex_buy_paradex`

### 平仓条件

1. **价差收敛**: 当前价差 <= 50 USD
2. **强制平仓**: 持仓时间 > 30分钟

### 价差计算

使用实时订单簿的bid/ask价格计算：

```typescript
spreadA = paradexBid - edgexAsk  // 买EdgeX卖Paradex
spreadB = edgexBid - paradexAsk  // 卖EdgeX买Paradex
```

## 核心修复

### Race Condition修复

**问题**: 平仓时重复触发导致同一持仓被多次平仓

**解决**: 添加`isClosing`标志位防止并发平仓

```typescript
private isClosing: boolean = false;

async closeAllPositions(): Promise<boolean> {
  if (this.isClosing) {
    return false;  // 正在平仓，直接返回
  }

  this.isClosing = true;
  try {
    // 执行平仓...
  } finally {
    this.isClosing = false;  // 确保标志位被重置
  }
}
```

### 价差计算一致性

**问题**: 开仓和平仓使用不同的价差计算方式导致秒开秒平

**解决**: 统一使用bid/ask计算价差

```typescript
// 开仓检查
const spreadA = paradexBid - edgexAsk;

// 平仓检查 (使用相同方式)
const currentOpenSpread = position.direction === 'buy_edgex_sell_paradex'
  ? paradexBid - edgexAsk
  : edgexBid - paradexAsk;
```

## 交易记录

所有交易记录保存在 `data/trade-history-edgex-paradex.json`:

```json
{
  "openTrades": [...],
  "closedTrades": [
    {
      "id": "1760110829952-emzjgb02d",
      "direction": "buy_edgex_sell_paradex",
      "amount": 0.01,
      "edgexPrice": 119045.1,
      "paradexPrice": 119232,
      "openSpread": 186.9,
      "closeSpread": 186.6,
      "pnl": -1.35,
      "totalFee": 1.36,
      "holdTime": 27794
    }
  ]
}
```

## 注意事项

⚠️ **风险提示**:
- 套利交易涉及高频交易和杠杆，存在资金风险
- 价差可能因市场波动快速消失
- 网络延迟可能导致实际成交价差小于触发价差
- 建议先用小仓位测试

⚠️ **安全提示**:
- 请勿将 `.env` 文件提交到Git
- 私钥和API密钥务必妥善保管
- 定期检查账户余额和持仓情况

## 问题排查

### 问题1: 秒开秒平

**症状**: 开仓后几秒内就平仓

**原因**: 开仓后orderbook未恢复，价差计算错误

**解决**: 确保开仓和平仓使用相同的价差计算方式

### 问题2: 重复平仓

**症状**: 同一持仓被多次平仓

**原因**: Race condition，并发平仓请求

**解决**: 使用`isClosing`标志位防止并发

### 问题3: 持仓数量不匹配

**症状**: EdgeX和Paradex持仓数量不一致

**原因**: Paradex精度要求（必须是0.00001的倍数）

**解决**: 订单数量四舍五入到正确精度

## 性能指标

- **价格更新频率**: 100ms
- **交易检查频率**: 100ms
- **最小交易间隔**: 100ms
- **数据有效期**: 3秒

## 文件说明

- `edgex-paradex-arb-bot.ts` - 主程序
- `edgex-paradex-config.ts` - 配置文件
- `utils/simple-trader-edgex-paradex.ts` - 交易执行器
- `utils/trade-history-edgex-paradex.ts` - 交易记录管理
- `TradeExecutor.js` - 订单执行（与Python通信）
- `edgex_trading_service.py` - EdgeX Python服务
- `paradex_ws_service.py` - Paradex WebSocket服务
- `pm2.config.cjs` - PM2配置

## License

MIT
