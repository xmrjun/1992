# Lighter.xyz 平仓问题完整解决方案

## 🔍 问题描述

用户有做多 0.01000 BTC 的仓位（5x杠杆），发送多个平仓订单都返回成功（code=200），但仓位没有减少。使用的参数：
- BaseAmount: 1000000 (对应 0.01 BTC)
- IsAsk: True (卖单)
- ReduceOnly: True (只平仓)
- Type: 1 (市价单)
- Price: 1185900

## ✅ 源码分析结果

通过深入分析 Lighter Python SDK 源代码 (`/usr/local/lib/python3.10/dist-packages/lighter/signer_client.py`)，发现：

### 1. 用户参数正确性验证
- ✅ **平仓方向正确**: 做多仓位平仓确实需要 `is_ask=True` (卖出)
- ✅ **reduce_only 设置正确**: `reduce_only=True` 确保只平仓，不开新仓
- ✅ **数量转换正确**: 0.01 BTC → 1000000 (8位精度) 是正确的
- ✅ **订单类型正确**: `ORDER_TYPE_MARKET` (1) 是市价单

### 2. SDK 方法分析
`create_market_order` 方法最终调用 `create_order`，参数传递链：
```python
create_market_order() → create_order() → sign_create_order() → SignCreateOrder (C库)
```

## 🎯 根本原因分析

**关键发现**: `tx_hash.code = 200` 只表示订单被 Lighter 接受，**不代表订单实际执行**。

### 订单生命周期
1. **提交阶段**: 订单发送到 Lighter，返回 code=200
2. **匹配阶段**: 订单进入订单簿等待匹配
3. **执行阶段**: 找到对手方并实际成交

### 可能的执行失败原因
1. **流动性不足**: 订单簿没有足够的买单来匹配卖出
2. **价格保护**: 市价单偏离当前价格过大被拒绝
3. **余额问题**: 账户保证金或手续费不足
4. **风控限制**: 触发系统风险控制机制
5. **部分成交**: 只有部分数量被匹配，剩余被取消

## 💡 完整解决方案

### 方案1: 使用限价单平仓（推荐）

```python
import asyncio
import time
from lighter import SignerClient

async def close_position_with_limit_order(signer, market_id, amount, current_price):
    """使用限价单平仓，更可控"""

    base_amount = int(amount * 1e8)  # 转换为8位精度
    client_order_index = int(time.time() * 1000) % (2**63)

    # 设置略低于市价的限价，确保快速成交
    limit_price = int(current_price * 0.995)  # 比当前价格低 0.5%

    try:
        created_tx, tx_hash, error = await signer.create_order(
            market_index=market_id,
            client_order_index=client_order_index,
            base_amount=base_amount,
            price=limit_price,
            is_ask=True,  # 卖出平多仓
            order_type=signer.ORDER_TYPE_LIMIT,
            time_in_force=signer.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
            reduce_only=True,
            order_expiry=int(time.time()) + 3600  # 1小时后过期
        )

        if error:
            print(f"❌ 平仓失败: {error}")
            return False

        if tx_hash.code == 200:
            print(f"✅ 限价平仓订单已提交: {tx_hash}")
            print(f"📝 订单价格: ${limit_price/100:.2f}")
            return True
        else:
            print(f"⚠️ 异常状态码: {tx_hash.code}")
            return False

    except Exception as e:
        print(f"❌ 平仓异常: {e}")
        return False
```

### 方案2: 分批平仓

```python
async def close_position_in_batches(signer, market_id, total_amount, batch_size=0.002):
    """分批平仓，降低单笔风险"""

    remaining = total_amount
    batch_count = 0

    while remaining > 0.001:  # 最小 0.001 BTC
        current_batch = min(batch_size, remaining)

        print(f"📦 批次 {batch_count + 1}: 平仓 {current_batch} BTC")

        success = await close_position_with_limit_order(
            signer, market_id, current_batch, 118590
        )

        if success:
            remaining -= current_batch
            batch_count += 1
            print(f"✅ 批次完成，剩余: {remaining} BTC")

            # 等待一段时间再执行下一批
            await asyncio.sleep(2)
        else:
            print(f"❌ 批次失败，停止分批平仓")
            break

    print(f"📊 分批平仓完成: {batch_count} 个批次")
    return remaining < 0.001
```

### 方案3: 订单状态跟踪

```python
async def close_position_with_tracking(signer, market_id, amount):
    """平仓并跟踪订单执行状态"""

    # 首先检查订单簿流动性
    try:
        order_book = await signer.order_api.order_book_orders(market_id, 5)

        if len(order_book.bids) == 0:
            print("❌ 订单簿无买单，无法平仓")
            return False

        best_bid = float(order_book.bids[0].price.replace('.', '')) / 100
        total_bid_volume = sum(
            float(bid.remaining_base_amount.replace('.', '')) / 1e8
            for bid in order_book.bids[:3]
        )

        print(f"📊 流动性检查:")
        print(f"   最佳买价: ${best_bid:.2f}")
        print(f"   前3档买量: {total_bid_volume:.6f} BTC")

        if total_bid_volume < amount:
            print("⚠️ 流动性可能不足，建议分批平仓")

    except Exception as e:
        print(f"⚠️ 无法检查流动性: {e}")

    # 创建平仓订单
    base_amount = int(amount * 1e8)
    client_order_index = int(time.time() * 1000) % (2**63)

    created_tx, tx_hash, error = await signer.create_market_order(
        market_index=market_id,
        client_order_index=client_order_index,
        base_amount=base_amount,
        avg_execution_price=118590,
        is_ask=True,
        reduce_only=True
    )

    if error or tx_hash.code != 200:
        print(f"❌ 订单提交失败: {error or tx_hash.code}")
        return False

    print(f"✅ 订单已提交，开始跟踪执行状态...")

    # 跟踪订单状态（需要额外的API调用）
    # 注意: Lighter SDK 可能没有直接的订单查询方法
    # 建议通过 Web 界面或其他方式确认执行状态

    return True
```

## 🔧 调试步骤

### 1. 立即检查事项
```bash
# 检查 Lighter 网页界面
1. 登录 Lighter 账户
2. 查看持仓页面，确认当前仓位大小
3. 查看订单历史，检查订单执行状态
4. 查看账户余额和保证金使用情况
```

### 2. 代码调试
```python
# 使用提供的调试脚本
python3 debug-order-status.py

# 或者手动检查
async def debug_current_status(signer):
    # 检查账户连接
    check_result = signer.check_client()
    if check_result:
        print(f"账户问题: {check_result}")

    # 检查订单簿
    order_book = await signer.order_api.order_book_orders(0, 5)
    print(f"买单数量: {len(order_book.bids)}")
    print(f"卖单数量: {len(order_book.asks)}")
```

### 3. 替代方案测试
```python
# 测试小额订单
await close_position_with_limit_order(signer, 0, 0.001, 118590)

# 如果小额成功，再尝试全部
await close_position_in_batches(signer, 0, 0.01, 0.002)
```

## 📞 技术支持

如果以上方案都无效，建议：

1. **联系 Lighter 客服**
   - 提供具体的订单时间戳和 client_order_index
   - 询问订单执行失败的具体原因

2. **检查 API 限制**
   - 确认账户没有被限制交易
   - 检查 API key 权限设置

3. **验证账户状态**
   - 确认保证金充足
   - 检查是否有未结算的资金

## 🎯 最终建议

基于源码分析，你的平仓参数是**完全正确**的。问题很可能在于：

1. **市场流动性不足** - 这是最可能的原因
2. **订单执行状态跟踪不完整** - code=200 ≠ 订单成交
3. **需要使用限价单而不是市价单** - 更可控的执行

**立即行动方案**:
1. 先在 Lighter 网页界面确认当前真实持仓
2. 使用限价单进行小额测试
3. 如果成功，分批完成全部平仓
4. 必要时联系 Lighter 技术支持

记住：交易安全第一，建议先用小额测试验证方案的有效性。