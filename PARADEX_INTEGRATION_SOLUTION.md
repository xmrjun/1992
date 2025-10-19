# Paradex 集成方案总结

## 问题

TypeScript 实现 Paradex REST API 认证失败：
- 尝试1: 使用 `@scure/starknet` - API不兼容
- 尝试2: 使用 `starknet` 库 + TypedData - 签名验证失败

## 根本原因

Paradex 使用复杂的 StarkNet 账户系统：
- L2 地址不是简单从私钥派生
- 需要账户合约部署
- 签名需要特定的 TypedData 格式
- Python SDK 内部处理了这些复杂性

## ✅ 最佳方案：Python 全托管

### 架构
```
TypeScript (策略逻辑)
    ↓
Python Service (paradex_trading_service.py)
    ↓
Paradex SDK (官方 paradex_py)
```

### 实现
1. **Python 服务** - 处理所有 Paradex 操作
   - WebSocket 数据流（已实现 ✅）
   - REST API 认证
   - 下单/撤单
   - 查询订单/持仓

2. **TypeScript 调用** - 通过 stdio/JSON 通信
   ```typescript
   pythonProcess.stdin.write(JSON.stringify({
     action: 'create_order',
     params: { market: 'BTC-USD-PERP', side: 'BUY', size: 0.005 }
   }));
   ```

3. **Python 响应**
   ```python
   {
     "type": "order_result",
     "data": { "id": "...", "status": "..." }
   }
   ```

### 优势
- ✅ 使用官方 SDK，100% 兼容
- ✅ 无需重新实现复杂的签名逻辑
- ✅ 自动处理账户派生、认证
- ✅ WebSocket + REST 统一管理
- ✅ 易于维护和升级

### 劣势
- Python 进程开销（可接受，已经在用了）
- 需要管理进程通信（已有经验）

## 📋 下一步

1. 扩展 `paradex_ws_service.py` 增加交易功能
2. 添加命令接收机制（通过 stdin）
3. 在 TypeScript 中封装调用接口
4. 集成到套利机器人

---

**结论**: 不要重新发明轮子，直接用官方 Python SDK 是最稳妥的方案。
