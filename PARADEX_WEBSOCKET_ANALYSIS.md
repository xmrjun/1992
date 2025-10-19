# Paradex WebSocket 集成分析报告

## 📊 现状分析

### 1. EdgeX WebSocket 实现（已完成）✅
- **技术栈**: 原生 `ws` 库
- **连接方式**: 直接 WebSocket 连接到 `wss://quote.edgex.exchange`
- **认证方式**: StarkEx ECDSA 签名
- **消息格式**: JSON-RPC 2.0
- **功能**:
  - ✅ Public WebSocket (市场数据)
  - ✅ Private WebSocket (账户/订单/持仓)
  - ✅ 自动重连机制
  - ✅ 心跳处理
  - ✅ 实时价格推送

### 2. Paradex 当前实现（问题）❌
- **问题**: 使用 CCXT 但只实现了轮询（2秒/次）
- **效率**: 延迟高，不适合高频套利
- **代码位置**: `exchanges/paradex.ts` line 254-304

```typescript
// 当前实现 - 轮询模式
private async startPollingTicker(symbol: string): Promise<void> {
  const poll = async () => {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      // ... 每2秒轮询一次
      setTimeout(poll, 2000);
    } catch (error) {
      console.error('Error');
    }
  };
  poll();
}
```

### 3. Paradex Python SDK 分析 ✅

#### 核心 WebSocket 实现
- **文件**: `/root/paradex-py/paradex_py/api/ws_client.py`
- **协议**: WebSocket JSON-RPC 2.0
- **URL**: `wss://ws.api.{env}.paradex.trade/v1`
- **认证**: JWT Bearer Token

#### 关键特性
1. **自动重连**: ✅
2. **心跳检测**: ✅ (可配置 ping_interval)
3. **多通道订阅**: ✅
4. **异步消息处理**: ✅

#### 可用频道（ParadexWebsocketChannel）
```python
BBO = "bbo.{market}"  # 最佳买卖价
TRADES = "trades.{market}"  # 实时成交
ORDER_BOOK = "order_book.{market}.snapshot@{depth}@{refresh_rate}@{price_tick}"
ORDERS = "orders.{market}"  # 订单更新
POSITIONS = "positions"  # 持仓更新
ACCOUNT = "account"  # 账户更新
```

## 🔧 解决方案

### 方案一：使用 Paradex Python SDK（推荐）⭐

#### 优势
1. ✅ 官方支持，稳定可靠
2. ✅ 完整的 WebSocket 实现
3. ✅ 自动重连、心跳处理
4. ✅ 已经下载到本地：`/root/paradex-py`

#### 实现方式
创建 Python WebSocket 服务 + TypeScript 调用

**架构**:
```
TypeScript (套利bot)
    ↓ spawn
Python WebSocket 服务 (paradex_py)
    ↓ stdout/stdin 或 HTTP
TypeScript 接收价格数据
```

类似已有的 EdgeX Python wrapper 模式（`edgex-python-wrapper.ts`）

### 方案二：TypeScript 原生 WebSocket（备选）

使用 `ws` 库直接实现 Paradex WebSocket 协议

## 💡 推荐实现步骤

### Step 1: 创建 Paradex WebSocket Python 服务
```python
# paradex_ws_service.py
import asyncio
import json
import sys
from paradex_py import Paradex
from paradex_py.api.ws_client import ParadexWebsocketChannel
from paradex_py.environment import Environment

class ParadexWSService:
    async def start(self):
        # 初始化
        paradex = Paradex(
            env=Environment.TESTNET,
            l2_private_key="0x...",
            l2_address="0x..."
        )

        # 连接 WebSocket
        await paradex.ws_client.connect()

        # 订阅 BBO（最佳买卖价）
        await paradex.ws_client.subscribe(
            ParadexWebsocketChannel.BBO,
            callback=self.on_price_update,
            params={"market": "BTC-USD-PERP"}
        )

    async def on_price_update(self, channel, message):
        # 输出到 stdout 供 TypeScript 读取
        price_data = {
            "type": "price_update",
            "data": message
        }
        print(json.dumps(price_data), flush=True)
```

### Step 2: 创建 TypeScript Wrapper
```typescript
// paradex-python-ws.ts
import { spawn } from 'child_process';

export class ParadexPythonWS {
  private pythonProcess: any;
  private priceCallback?: (price: number) => void;

  async connect(callback: (price: number) => void) {
    this.priceCallback = callback;

    // 启动 Python 进程
    this.pythonProcess = spawn('python3', [
      '/root/aster-bot/paradex_ws_service.py'
    ]);

    // 监听输出
    this.pythonProcess.stdout.on('data', (data: Buffer) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'price_update') {
        const price = this.parsePrice(message.data);
        this.priceCallback?.(price);
      }
    });
  }
}
```

### Step 3: 集成到套利Bot
```typescript
// edgex-paradex-arbitrage-bot.ts (更新)
import { ParadexPythonWS } from './paradex-python-ws.js';

// 替换当前的轮询实现
const paradexWS = new ParadexPythonWS();
await paradexWS.connect((price) => {
  this.paradexPrice = price;
  this.checkArbitrageOpportunity();
});
```

## 📈 性能对比

| 指标 | 当前（轮询） | 改进后（WebSocket） |
|------|------------|------------------|
| 延迟 | 2000ms | ~50ms |
| CPU使用 | 高（持续请求） | 低（事件驱动） |
| 带宽 | 高 | 低 |
| 实时性 | ❌ | ✅ |
| 适合套利 | ❌ | ✅ |

## 🎯 关键配置

### 环境变量（需要添加到 `.env.paradex`）
```bash
# L2 账户信息（你提供的地址）
PARADEX_L2_ADDRESS=0x703de2fb6e449e6776903686da648caa07972a8bb5c76abbc95a2002f479172
PARADEX_L2_PRIVATE_KEY=your_l2_private_key

# WebSocket 配置
PARADEX_WS_TIMEOUT=30
PARADEX_MARKET=BTC-USD-PERP
```

## ⚠️ 注意事项

1. **L2 私钥**: 需要对应 L2_ADDRESS 的私钥
2. **环境选择**: TESTNET vs PRODUCTION
3. **错误处理**: WebSocket 断线重连
4. **资源管理**: Python 进程生命周期管理

## 📋 下一步行动

1. ✅ 验证 L2 地址和私钥
2. ⬜ 创建 `paradex_ws_service.py`
3. ⬜ 创建 `paradex-python-ws.ts` wrapper
4. ⬜ 更新 `edgex-paradex-arbitrage-bot.ts`
5. ⬜ 测试 WebSocket 连接
6. ⬜ 性能验证和优化

---
生成时间: 2025-10-04
