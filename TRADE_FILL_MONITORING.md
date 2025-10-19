# WebSocket 成交记录监听功能说明

## ✅ 已集成功能

### 1. EdgeX 成交记录监听

**Private WebSocket 频道**:
- 事件类型: `TRADE_UPDATE`
- 自动推送所有成交记录

**捕获信息**:
```typescript
{
  tradeId: string,          // 成交ID
  orderId: string,          // 订单ID
  side: 'buy' | 'sell',     // 买/卖
  quantity: number,         // 成交数量
  price: number,            // 实际成交价格
  fee: number,              // 手续费金额
  feeToken: string,         // 手续费币种
  liquidity: 'MAKER' | 'TAKER',  // 费率类型
  timestamp: number         // 时间戳
}
```

---

### 2. Paradex 成交记录监听

**Private WebSocket 频道**: `FILLS`
- 订阅: `fills.{market}`
- 实时推送成交数据

**捕获信息**:
```typescript
{
  id: string,               // 成交ID
  order_id: string,         // 订单ID
  market: string,           // 市场
  side: 'BUY' | 'SELL',     // 买/卖
  size: number,             // 成交数量
  price: number,            // 实际成交价格
  fee: number,              // 手续费金额
  fee_token: string,        // 手续费币种 (USDC)
  liquidity: 'MAKER' | 'TAKER',  // 费率类型
  created_at: string        // 创建时间
}
```

---

## 📊 套利Bot中的集成

### 仓位数据结构（扩展）

```typescript
interface ArbitragePosition {
  id: string;
  edgexSide: 'buy' | 'sell';
  paradexSide: 'buy' | 'sell';
  amount: number;
  edgexPrice: number;      // 预期价格
  paradexPrice: number;    // 预期价格
  spread: number;
  openTime: number;
  status: 'open' | 'closing' | 'closed';

  // ✅ 新增：实际成交记录
  edgexFills: TradeFill[];    // EdgeX实际成交
  paradexFills: TradeFill[];  // Paradex实际成交
}

interface TradeFill {
  id: string;
  orderId: string;
  side: string;
  size: number;
  price: number;             // ✅ 实际成交价
  fee: number;               // ✅ 实际手续费
  feeToken: string;
  liquidity: 'MAKER' | 'TAKER';  // ✅ 费率类型
  timestamp: number;
}
```

---

## 💰 实际成本计算

### 1. PnL计算（基于实际成交）

```typescript
calculateActualPnL(position) {
  // EdgeX PnL
  let edgexPnl = 0;
  let edgexFee = 0;
  position.edgexFills.forEach(fill => {
    if (fill.side === 'buy') {
      edgexPnl -= fill.price * fill.size;  // 买入成本
    } else {
      edgexPnl += fill.price * fill.size;  // 卖出收入
    }
    edgexFee += fill.fee;
  });

  // Paradex PnL
  let paradexPnl = 0;
  let paradexFee = 0;
  position.paradexFills.forEach(fill => {
    if (fill.side === 'buy') {
      paradexPnl -= fill.price * fill.size;
    } else {
      paradexPnl += fill.price * fill.size;
    }
    paradexFee += fill.fee;
  });

  // 总计
  const totalPnl = edgexPnl + paradexPnl;
  const totalFee = edgexFee + paradexFee;
  const netPnl = totalPnl - totalFee;

  return { pnl: totalPnl, totalFee, netPnl };
}
```

### 2. 实时手续费统计

```typescript
stats = {
  totalTrades: 0,
  profitableTrades: 0,
  totalProfit: 0,           // 毛利润
  totalFees: 0,             // ✅ 总手续费

  // ✅ 分交易所统计
  edgexTotalFee: 0,
  paradexTotalFee: 0,

  // ✅ Maker/Taker统计
  makerCount: 0,            // Maker次数
  takerCount: 0,            // Taker次数

  bestSpread: 0,
  opportunities: 0,
  startTime: Date.now()
}
```

---

## 📈 实时显示示例

### 成交时输出

```
💰 EdgeX成交: buy 0.005 @ $95000.50 | 手续费: $0.0950 (MAKER)
💰 Paradex成交: sell 0.005 @ $95120.80 | 手续费: $0.2378 (TAKER)
```

### 平仓时输出

```
✅ 仓位平仓成功!
   毛利润: $0.6015
   手续费: $0.6656
   净利润: -$0.0641
   累计毛利润: $2.4060
   累计净利润: -$0.2564
```

### 统计报告

```
📊 套利统计报告
=====================================
⏱️  运行时间: 45 分钟
📈 总交易次数: 4
💰 毛利润: $2.4060
💸 总手续费: $2.6624
   EdgeX: $0.3800
   Paradex: $2.2824
💵 净利润: -$0.2564
🎯 盈利交易: 1/4 (25.0%)
📊 平均利润: $0.6015 (净: -$0.0641)
📉 平均手续费: $0.6656
🏷️  手续费类型: Maker 4 | Taker 12
```

---

## 🎯 关键优势

### 1. ✅ 精确成本计算
- 不再依赖预估价格
- 实际成交价可能有滑点
- 手续费金额精确到小数点

### 2. ✅ Maker/Taker识别
- 自动识别是Maker还是Taker
- Maker: 0.02% 手续费
- Taker: 0.05% 手续费
- 可以优化策略使用限价单

### 3. ✅ 分交易所统计
- EdgeX手续费单独统计
- Paradex手续费单独统计
- 可以识别哪个交易所手续费更高

### 4. ✅ 实时监控
- WebSocket推送，无延迟
- 每笔成交立即知道
- 不需要轮询REST API

---

## 📊 手续费分析示例

### 场景：4笔交易（开仓+平仓）

**假设本金**: 0.005 BTC @ $95,000 = $475

#### Maker模式（限价单）
```
EdgeX开仓:  $475 × 0.02% = $0.095
Paradex开仓: $475 × 0.02% = $0.095
EdgeX平仓:  $475 × 0.02% = $0.095
Paradex平仓: $475 × 0.02% = $0.095
-------------------------------------------
总手续费: $0.38
```

#### Taker模式（市价单）
```
EdgeX开仓:  $475 × 0.05% = $0.238
Paradex开仓: $475 × 0.05% = $0.238
EdgeX平仓:  $475 × 0.05% = $0.238
Paradex平仓: $475 × 0.05% = $0.238
-------------------------------------------
总手续费: $0.95
```

#### 混合模式（1 Maker + 3 Taker）
```
EdgeX开仓:  $475 × 0.02% = $0.095  (Maker)
Paradex开仓: $475 × 0.05% = $0.238  (Taker)
EdgeX平仓:  $475 × 0.05% = $0.238  (Taker)
Paradex平仓: $475 × 0.05% = $0.238  (Taker)
-------------------------------------------
总手续费: $0.809
```

**结论**:
- 全Maker: $0.38 ✅
- 全Taker: $0.95 ❌
- 混合: $0.81

**建议**: 尽量使用限价单，成为Maker

---

## 🔧 如何优化为Maker

### 当前（市价单）
```typescript
await edgexAPI.createMarketOrder('BTCUSD', 'buy', 0.005);
// → Taker (0.05%)
```

### 优化（限价单）
```typescript
// 使用当前价格的限价单
const currentPrice = this.edgexPrice;
await edgexAPI.createOrder('BTCUSD', 'limit', 'buy', 0.005, currentPrice);
// → Maker (0.02%)
```

**注意**: 限价单可能不会立即成交，需要等待

---

## 📋 监控清单

### 实时监控
- [x] 每笔成交实时推送
- [x] 显示实际成交价
- [x] 显示手续费金额
- [x] 显示Maker/Taker类型

### 统计数据
- [x] 累计手续费
- [x] 分交易所手续费
- [x] Maker/Taker比例
- [x] 净利润（扣除手续费）

### 成本分析
- [x] 每个仓位的实际成本
- [x] 毛利润 vs 净利润
- [x] 手续费占比

---

## 🎯 使用建议

1. **观察Maker/Taker比例**
   - 如果全是Taker，考虑改用限价单
   - 目标：80%以上是Maker

2. **监控手续费占比**
   - 手续费/毛利润 应该 < 50%
   - 如果超过50%，说明价差太小

3. **调整开仓阈值**
   - 如果手续费吃掉大部分利润
   - 提高ARB_THRESHOLD（例如从100到150）

4. **分析哪个交易所手续费高**
   - 如果Paradex手续费特别高
   - 可能是永续合约的资金费率
   - 考虑缩短持仓时间

---

**文档时间**: 2025-10-04
**功能**: ✅ WebSocket成交记录监听
**状态**: 已集成并可用
