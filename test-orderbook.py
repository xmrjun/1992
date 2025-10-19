#!/usr/bin/env python3
"""
测试订单簿数据接收
"""

import sys
import asyncio
import json

sys.path.insert(0, '/root/aster-bot')
from edgex_trading_service import EdgeXTradingService

sys.path.insert(0, '/root/paradex-py')
from paradex_py import Paradex
from paradex_py.environment import Environment

async def test_edgex_orderbook():
    print("\n=== 测试 EdgeX 订单簿 ===")

    edgex = EdgeXTradingService(
        account_id="661402380167807119",
        stark_private_key=open("/root/.env.edgex").read().split("STARK_PRIVATE_KEY=")[1].split("\n")[0].strip()
    )

    await edgex.initialize()
    print("✅ EdgeX 初始化完成，等待 5 秒接收数据...")
    await asyncio.sleep(5)

    # 检查订单簿数据
    if edgex.orderbook:
        print(f"✅ 订单簿数据存在")
        print(f"   Bids 档位: {len(edgex.orderbook.get('bids', []))}")
        print(f"   Asks 档位: {len(edgex.orderbook.get('asks', []))}")
        if edgex.orderbook.get('bids'):
            print(f"   最佳买价: ${edgex.orderbook['bids'][0][0]:.2f} x {edgex.orderbook['bids'][0][1]}")
        if edgex.orderbook.get('asks'):
            print(f"   最佳卖价: ${edgex.orderbook['asks'][0][0]:.2f} x {edgex.orderbook['asks'][0][1]}")
    else:
        print("❌ 订单簿数据为空")

    await edgex.close()

async def test_paradex_orderbook():
    print("\n=== 测试 Paradex 订单簿 ===")

    # 这里需要导入 ParadexWSService
    sys.path.insert(0, '/root/aster-bot')
    from paradex_ws_service import ParadexWSService

    paradex_service = ParadexWSService()
    await paradex_service.initialize()
    print("✅ Paradex 初始化完成，等待 5 秒接收数据...")
    await asyncio.sleep(5)

    # 检查订单簿数据
    if paradex_service.orderbook:
        print(f"✅ 订单簿数据存在")
        print(f"   Bids 档位: {len(paradex_service.orderbook.get('bids', []))}")
        print(f"   Asks 档位: {len(paradex_service.orderbook.get('asks', []))}")
        if paradex_service.orderbook.get('bids'):
            print(f"   最佳买价: ${paradex_service.orderbook['bids'][0][0]:.2f} x {paradex_service.orderbook['bids'][0][1]}")
        if paradex_service.orderbook.get('asks'):
            print(f"   最佳卖价: ${paradex_service.orderbook['asks'][0][0]:.2f} x {paradex_service.orderbook['asks'][0][1]}")
    else:
        print("❌ 订单簿数据为空")

    await paradex_service.close()

async def main():
    await test_edgex_orderbook()
    await test_paradex_orderbook()

if __name__ == "__main__":
    asyncio.run(main())
