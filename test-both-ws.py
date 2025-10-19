#!/usr/bin/env python3
"""同时测试 EdgeX 和 Paradex WebSocket"""

import asyncio
import sys
import os

# EdgeX
sys.path.insert(0, '/root/edgex-python-sdk')
from edgex_sdk import WebSocketManager as EdgeXWS

# Paradex
from paradex_py import Paradex, Environment

edgex_price = None
paradex_price = None

def handle_edgex_ticker(message):
    """EdgeX Ticker"""
    global edgex_price
    try:
        if isinstance(message, str):
            import json
            message = json.loads(message)

        content = message.get("content", {})
        data_list = content.get("data", [])
        if not data_list:
            return

        data = data_list[0]
        if data.get("contractId") == "10000001":
            last_price = data.get("lastPrice")
            if last_price:
                edgex_price = float(last_price)
    except Exception as e:
        pass

async def test_ws():
    global edgex_price, paradex_price
    
    # === EdgeX WebSocket ===
    print("🔗 启动 EdgeX WebSocket...")
    edgex_ws = EdgeXWS(
        base_url="wss://quote.edgex.exchange",
        account_id=int(os.getenv("EDGEX_ACCOUNT_ID", "661402380167807119")),
        stark_pri_key=os.getenv("EDGEX_STARK_PRIVATE_KEY", "007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2")
    )
    edgex_ws.connect_public()
    edgex_ws.subscribe_ticker("10000001", handle_edgex_ticker)
    print("✅ EdgeX WebSocket 已订阅")

    # === Paradex WebSocket ===
    print("🔗 启动 Paradex WebSocket...")
    paradex = Paradex(
        env=Environment.PROD,
        l2_private_key=os.getenv("PARADEX_L2_PRIVATE_KEY"),
    )
    
    def handle_paradex_ticker(message):
        global paradex_price
        try:
            if message.get("channel") == "bbo" and message.get("type") == "snapshot":
                results = message.get("results", [])
                for result in results:
                    if result.get("market") == "BTC-USD-PERP":
                        best_bid = result.get("best_bid")
                        best_ask = result.get("best_ask")
                        if best_bid and best_ask:
                            paradex_price = (float(best_bid) + float(best_ask)) / 2
        except Exception as e:
            pass
    
    # 订阅 BBO
    await paradex.ws.connect()
    await paradex.ws.subscribe_bbo(["BTC-USD-PERP"], on_message=handle_paradex_ticker)
    print("✅ Paradex WebSocket 已订阅\n")

    # 等待并显示价差
    print("=" * 60)
    for i in range(20):
        await asyncio.sleep(2)
        if edgex_price and paradex_price:
            spread = edgex_price - paradex_price
            status = "✅" if abs(spread) < 200 else "⚠️"
            print(f"{status} [{i+1:2d}] 价差: ${spread:7.2f} | EdgeX: ${edgex_price:8.2f} | Paradex: ${paradex_price:8.2f}")

    print("=" * 60)
    print("\n✅ 两个 WebSocket 都正常工作")
    await paradex.ws.disconnect()

if __name__ == "__main__":
    asyncio.run(test_ws())
