# Lighter.xyz 真实交易实现说明

## 📋 当前状态

已完成：
- ✅ WebSocket 价格监控
- ✅ 订单数据结构构建
- ✅ 模拟交易测试
- ✅ API 配置和凭证

待实现：
- ⚠️ ECDSA 签名认证
- ⚠️ 真实订单提交

## 🔧 技术要求

### 1. 认证流程
- 需要使用 ECDSA (secp256k1) 签名
- 每个 API_KEY 需要维护 nonce（递增）
- 签名包含：订单数据 + nonce + timestamp

### 2. 订单参数
```javascript
{
  market_id: 1,           // BTCUSDT
  side: 'buy',
  order_type: 'limit',
  size: "0.00100000",     // 0.001 BTC
  price: "50000.00",      // 远低于市价，安全
  post_only: true         // 只做 maker
}
```

### 3. 环境变量（已配置）
- `LIGHTER_API_HOST`: https://mainnet.zklighter.elliot.ai
- `LIGHTER_ACCOUNT_INDEX`: 18892
- `LIGHTER_API_KEY_INDEX`: 11
- `LIGHTER_API_KEY_PRIVATE_KEY`: fe504907...
- `LIGHTER_WALLET_ADDRESS`: 0xbAd6ddf...

## 🚀 测试订单规格

- **数量**: 0.001 BTC（约 $117）
- **限价**: $50,000（市价的 43%，不会成交）
- **最大风险**: $50
- **订单类型**: Post-Only 限价单

## 📌 安全措施

1. **价格安全**：设置远低于市价，避免立即成交
2. **数量控制**：使用小额测试（0.001 BTC）
3. **Post-Only**：确保只做 maker，避免 taker 费用
4. **模拟优先**：先在模拟模式验证

## 🔄 下一步

1. **方案一**：使用 Python SDK
   - 安装: `pip install git+https://github.com/elliottech/lighter-python.git`
   - 实现签名和交易

2. **方案二**：实现 TypeScript 签名
   - 使用 elliptic 库实现 ECDSA
   - 参考 Python SDK 的签名逻辑

3. **方案三**：使用官方 Web 界面
   - 登录 https://app.lighter.xyz
   - 手动下单测试

## ⚠️ 重要提醒

- 真实交易需要正确的签名实现
- 建议先在测试网验证
- 当前模拟模式可以验证所有逻辑
- 真实交易前请仔细检查价格和数量