# EdgeX-Paradex 套利机器人启动指南

## 🚀 快速启动

### 方式1: PM2 启动（推荐，后台运行）

```bash
cd /root/aster-bot

# 启动 EdgeX-Paradex 套利机器人
pm2 start pm2.config.cjs --only edgex-paradex-arbitrage

# 查看日志（实时）
pm2 logs edgex-paradex-arbitrage

# 查看状态
pm2 status

# 停止
pm2 stop edgex-paradex-arbitrage

# 重启
pm2 restart edgex-paradex-arbitrage

# 删除
pm2 delete edgex-paradex-arbitrage
```

### 方式2: 直接运行（前台，测试用）

```bash
cd /root/aster-bot
npx tsx edgex-paradex-arbitrage-bot.ts
```

---

## 📋 启动前检查清单

### 1. 环境变量配置

#### EdgeX 配置（.env.edgex）
```bash
cat .env.edgex
```
需要包含：
- `EDGEX_STARK_PRIVATE_KEY` - StarkEx私钥
- `EDGEX_ACCOUNT_ID` - 账户ID

#### Paradex 配置（.env.paradex）
```bash
cat .env.paradex
```
需要包含：
- `PARADEX_L1_ADDRESS=0x123aAa7Afb675b76c37A2d36CE5eE6179f892d76`
- `PARADEX_L2_PRIVATE_KEY=0x57abc834fead9a4984a557b9cff8d576bf87765f8ec2181d79a7f15e70e46f2`
- `PARADEX_TESTNET=true` (测试网) 或 `false` (主网)

### 2. Python SDK 安装

```bash
# 检查 paradex_py 是否安装
python3 -c "import paradex_py; print('✅ Paradex SDK 已安装')"

# 如果没安装
cd /root/paradex-py
pip install -e .
```

### 3. Node.js 依赖

```bash
cd /root/aster-bot
npm install
```

### 4. 账户余额检查

确保两个交易所都有足够余额：
- EdgeX: >= 0.005 BTC 保证金
- Paradex: >= 0.005 BTC 保证金 + USDC

---

## 📊 启动输出示例

### 正常启动日志

```
🚀 EdgeX ↔ Paradex 套利机器人启动
=====================================
EdgeX: BTCUSD
Paradex: BTC-USD-PERP
策略: 双向对冲套利
交易量: 0.005 BTC
开仓: 价差 ≥ $100
平仓: 价差 ≤ $40
最大持仓: 5 个
模式: 🧪 测试网

🔌 初始化交易所连接...

📡 连接 EdgeX Public WebSocket...
✅ EdgeX Public WebSocket 已连接
📡 连接 EdgeX Private WebSocket...
✅ EdgeX Private WebSocket 已连接
📡 连接 Paradex (官方SDK WebSocket)...
✅ Paradex WebSocket 已连接
   L2地址: 0x...
✅ Paradex WebSocket 就绪
📡 认证 Paradex REST API...
✅ Paradex REST API 已认证

🎯 所有交易所连接完成，开始监控...

🔄 开始交易监控...

[15:30:45] EdgeX: $95,000 | Paradex: $95,025 | 价差: $25
[15:31:15] EdgeX: $95,010 | Paradex: $95,130 | 价差: $120

🚨 套利机会! 价差: $120.00 (0.126%)
   EdgeX: $95,010.00 | Paradex: $95,130.00

⚡ 执行套利交易: buy EdgeX @ $95,010.00, sell Paradex @ $95,130.00

💰 EdgeX成交: buy 0.005 @ $95010.50 | 手续费: $0.0950 (MAKER)
💰 Paradex成交: sell 0.005 @ $95129.80 | 手续费: $0.2378 (TAKER)

✅ 套利仓位开启成功!
   EdgeX 订单: 12345678
   Paradex 订单: abcd1234
   仓位 ID: arb_1728...
   预期利润: $0.60
```

---

## 🔍 监控命令

### PM2 监控

```bash
# 实时日志
pm2 logs edgex-paradex-arbitrage

# 只看最新100行
pm2 logs edgex-paradex-arbitrage --lines 100

# 只看错误日志
pm2 logs edgex-paradex-arbitrage --err

# 查看进程状态
pm2 status

# 查看详细信息
pm2 show edgex-paradex-arbitrage

# 查看监控面板
pm2 monit
```

### 日志文件查看

```bash
# 实时查看输出日志
tail -f /root/aster-bot/logs/edgex-paradex-out.log

# 实时查看错误日志
tail -f /root/aster-bot/logs/edgex-paradex-error.log

# 查看完整日志
tail -f /root/aster-bot/logs/edgex-paradex-combined.log
```

---

## ⚠️ 常见问题

### 1. Python进程启动失败

**症状**: `paradex_ws_service.py` 无法启动

**解决**:
```bash
# 检查Python SDK
python3 /root/aster-bot/paradex_ws_service.py

# 查看错误信息
pm2 logs edgex-paradex-arbitrage --err
```

### 2. WebSocket连接失败

**症状**: EdgeX或Paradex WebSocket连接超时

**解决**:
```bash
# 检查网络
ping pro.edgex.exchange
ping api.testnet.paradex.trade

# 检查环境变量
env | grep PARADEX
env | grep EDGEX
```

### 3. 认证失败

**症状**: `❌ 认证失败` 或 `Unauthorized`

**解决**:
```bash
# 检查私钥格式
echo $PARADEX_L2_PRIVATE_KEY | wc -c  # 应该是67（包含0x和换行符）

# 检查L1地址
echo $PARADEX_L1_ADDRESS

# 重新加载环境变量
pm2 restart edgex-paradex-arbitrage --update-env
```

### 4. 内存占用过高

**症状**: 进程占用超过2G内存

**解决**:
```bash
# 查看内存使用
pm2 status

# 重启释放内存
pm2 restart edgex-paradex-arbitrage
```

---

## 📈 测试流程

### 第一步：测试网测试

```bash
# 确认使用测试网
grep PARADEX_TESTNET /root/aster-bot/.env.paradex
# 应该显示: PARADEX_TESTNET=true

# 启动
pm2 start pm2.config.cjs --only edgex-paradex-arbitrage

# 观察5-10分钟
pm2 logs edgex-paradex-arbitrage
```

### 第二步：检查统计

每10分钟会自动显示统计报告，注意查看：
- 手续费是否过高（应该 < 50%利润）
- Maker/Taker比例（建议80%以上Maker）
- 净利润是否为正

### 第三步：调整参数（如需要）

如果手续费过高，修改配置：
```typescript
// edgex-paradex-arbitrage-bot.ts
ARB_THRESHOLD: 150,  // 提高到150（需要更大价差）
CLOSE_THRESHOLD: 30, // 降低到30（提前平仓）
```

重启生效：
```bash
pm2 restart edgex-paradex-arbitrage
```

### 第四步：主网部署（谨慎！）

```bash
# 修改配置
vi /root/aster-bot/.env.paradex
# 改为: PARADEX_TESTNET=false

# 重启
pm2 restart edgex-paradex-arbitrage --update-env

# 密切监控前几笔交易
pm2 logs edgex-paradex-arbitrage --lines 200
```

---

## 🛑 紧急停止

如果需要紧急停止套利机器人：

```bash
# 停止机器人（会尝试平仓所有持仓）
pm2 stop edgex-paradex-arbitrage

# 如果卡住，强制停止
pm2 delete edgex-paradex-arbitrage

# 手动平仓（如果自动平仓失败）
# 登录交易所手动操作
```

---

## 📊 性能监控

### 系统资源

```bash
# CPU和内存
pm2 monit

# 详细进程信息
htop
```

### 网络延迟

```bash
# EdgeX延迟
ping pro.edgex.exchange

# Paradex延迟
ping api.testnet.paradex.trade
```

---

## 💡 优化建议

### 1. 使用限价单（降低手续费）

当前使用市价单，可以改为限价单：

```typescript
// 在 placeEdgexOrder 和 placeParadexOrder 中
// 将 'market' 改为 'limit'
// 价格使用当前价格
```

### 2. 调整开仓阈值

根据实际手续费情况调整：
- 手续费高 → 提高ARB_THRESHOLD
- 机会少 → 降低ARB_THRESHOLD

### 3. 监控Python进程

```bash
# 查看Python进程
ps aux | grep paradex_ws_service

# 如果内存过高，定期重启
pm2 restart edgex-paradex-arbitrage
```

---

## 📞 问题排查

遇到问题时，按以下顺序检查：

1. **查看日志**: `pm2 logs edgex-paradex-arbitrage`
2. **检查进程**: `pm2 status`
3. **检查网络**: `ping pro.edgex.exchange`
4. **检查配置**: `cat .env.paradex`
5. **检查Python**: `python3 -c "import paradex_py"`
6. **重启服务**: `pm2 restart edgex-paradex-arbitrage`

---

**文档时间**: 2025-10-04
**版本**: v1.0
**状态**: ✅ 可用
