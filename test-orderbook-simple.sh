#!/bin/bash

echo "=== 启动 EdgeX 服务测试订单簿 ==="
cd /root/aster-bot

# 启动 EdgeX，等待 8 秒，然后检查日志
timeout 8 python3 edgex_trading_service.py 2>&1 | grep -E "订单簿|bids|asks|Depth" | head -20

echo ""
echo "=== 启动 Paradex 服务测试订单簿 ==="
timeout 8 python3 paradex_ws_service.py 2>&1 | grep -E "订单簿|bids|asks|ORDER_BOOK" | head -20
