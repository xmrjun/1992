#!/usr/bin/env python3
"""测试修复后的 EdgeX WebSocket"""

import asyncio
import sys
import os

sys.path.insert(0, '/root/edgex-python-sdk')

from edgex_sdk import WebSocketManager

def handle_ticker(message):
    """处理 Ticker 更新 (使用修复后的逻辑)"""
    try:
        # 如果 message 是字符串，先解析成 JSON
        if isinstance(message, str):
            import json
            message = json.loads(message)

        # EdgeX WebSocket 数据结构
        content = message.get("content", {})
        data_list = content.get("data", [])

        if not data_list:
            return

        data = data_list[0]
        contract_id = data.get("contractId")

        if contract_id == "10000001":
            best_bid = data.get("bestBidPrice")
            best_ask = data.get("bestAskPrice")
            last_price = data.get("lastPrice")

            if best_bid and best_ask:
                mid = (float(best_bid) + float(best_ask)) / 2
                print(f"✅ 价格更新: Bid=${best_bid}, Ask=${best_ask}, Mid=${mid:.2f}")
            elif last_price:
                mid = float(last_price)
                print(f"✅ 价格更新: Last=${last_price}, Mid=${mid:.2f}")

    except Exception as e:
        print(f"❌ 解析错误: {e}")

async def main():
    account_id = int(os.getenv("EDGEX_ACCOUNT_ID", "661402380167807119"))
    stark_private_key = os.getenv("EDGEX_STARK_PRIVATE_KEY", "007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2")
    ws_url = "wss://quote.edgex.exchange"

    print(f"🔗 测试修复后的 EdgeX WebSocket\n")

    ws_manager = WebSocketManager(
        base_url=ws_url,
        account_id=account_id,
        stark_pri_key=stark_private_key
    )

    ws_manager.connect_public()
    ws_manager.subscribe_ticker("10000001", handle_ticker)

    print(f"✅ 订阅成功，等待价格推送...\n")

    await asyncio.sleep(10)

if __name__ == "__main__":
    asyncio.run(main())
