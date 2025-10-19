#!/usr/bin/env python3
"""测试 EdgeX WebSocket 价格推送"""

import asyncio
import sys
import os

sys.path.insert(0, '/root/edgex-python-sdk')

from edgex_sdk import WebSocketManager

def handle_ticker(message):
    """处理 Ticker 更新"""
    print(f"📦 收到消息类型: {type(message)}")
    print(f"📦 原始消息: {message}")
    
    try:
        # 如果是字符串，解析 JSON
        if isinstance(message, str):
            import json
            message = json.loads(message)
        
        data = message.get("data", {})
        contract_id = data.get("contractId")
        
        print(f"\n✅ 解析成功:")
        print(f"   合约ID: {contract_id}")
        print(f"   买价: ${data.get('bestBidPrice')}")
        print(f"   卖价: ${data.get('bestAskPrice')}")
        print(f"   标记价: ${data.get('markPrice')}")
        print(f"   时间戳: {data.get('timestamp')}\n")
        
    except Exception as e:
        print(f"❌ 解析错误: {e}\n")

async def main():
    account_id = int(os.getenv("EDGEX_ACCOUNT_ID", "661402380167807119"))
    stark_private_key = os.getenv("EDGEX_STARK_PRIVATE_KEY", "007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2")
    ws_url = "wss://quote.edgex.exchange"

    print(f"🔗 连接 EdgeX WebSocket: {ws_url}")
    print(f"   账户ID: {account_id}\n")

    # 创建 WebSocket Manager
    ws_manager = WebSocketManager(
        base_url=ws_url,
        account_id=account_id,
        stark_pri_key=stark_private_key
    )

    # 连接公开流
    ws_manager.connect_public()

    print(f"✅ WebSocket 连接成功\n")

    # 订阅 BTC-USD-PERP ticker (contract_id: 10000001)
    print(f"📡 订阅 BTC-USD-PERP (10000001) ticker...")
    ws_manager.subscribe_ticker("10000001", handle_ticker)

    print(f"✅ 订阅成功，等待价格推送...\n")

    # 保持运行 30 秒
    await asyncio.sleep(30)

if __name__ == "__main__":
    asyncio.run(main())
