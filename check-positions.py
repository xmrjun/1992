#!/usr/bin/env python3
"""
Check actual positions on both exchanges
"""

import sys
import asyncio
import json

# EdgeX
sys.path.insert(0, '/root/aster-bot')
from edgex_trading_service import EdgeXTradingService

# Paradex
sys.path.insert(0, '/root/paradex-py')
from paradex_py import Paradex
from paradex_py.environment import Environment

async def check_positions():
    print("🔌 初始化交易服务...\n")

    # Initialize EdgeX
    edgex = EdgeXTradingService(
        account_id="661402380167807119",
        stark_private_key=open("/root/.api_keys/edgex_stark_private_key.txt").read().strip()
    )

    # Initialize Paradex
    paradex = Paradex(
        env=Environment.PROD,
        l2_private_key=open("/root/.api_keys/paradex_l2_private_key.txt").read().strip()
    )

    try:
        # Start EdgeX
        await edgex.initialize()
        await asyncio.sleep(2)

        # Query EdgeX position
        print("📊 查询 EdgeX 持仓...")
        pos_result = edgex.paradex.api_client.fetch_account()

        # Get EdgeX position directly via API
        import requests
        headers = {
            "Authorization": f"Bearer {open('/root/.api_keys/edgex_api_key.txt').read().strip()}",
            "Content-Type": "application/json"
        }

        response = requests.post(
            "https://pro.edgex.exchange/api/v1/private/account/getAccountDetail",
            headers=headers,
            json={}
        )

        edgex_data = response.json()
        edgex_positions = edgex_data.get("data", {}).get("positions", [])

        edgex_pos = 0.0
        for pos in edgex_positions:
            if pos.get("contractId") == "10000001":  # BTC-USD-PERP
                size = float(pos.get("size", 0))
                side = pos.get("side")
                edgex_pos = size if side == "LONG" else -size
                print(f"   EdgeX BTC-USD-PERP: {side} {size} BTC @ ${float(pos.get('avgPrice', 0)):.2f}")
                break

        # Query Paradex position
        print("\n📊 查询 Paradex 持仓...")
        paradex_result = paradex.api_client.fetch_positions()

        paradex_pos = 0.0
        if isinstance(paradex_result, dict) and "results" in paradex_result:
            for pos in paradex_result["results"]:
                if pos.get("market") == "BTC-USD-PERP":
                    # Paradex size field already has sign
                    paradex_pos = float(pos.get("size", 0))
                    side = pos.get("side")
                    print(f"   Paradex BTC-USD-PERP: {side} {abs(paradex_pos)} BTC @ ${float(pos.get('average_entry_price', 0)):.2f}")
                    break

        # Summary
        print(f"\n{'='*50}")
        print(f"EdgeX 持仓:   {'+' if edgex_pos > 0 else ''}{edgex_pos:.4f} BTC")
        print(f"Paradex 持仓: {'+' if paradex_pos > 0 else ''}{paradex_pos:.4f} BTC")
        print(f"总持仓偏差:   {abs(edgex_pos + paradex_pos):.4f} BTC")
        print(f"{'='*50}")

        if abs(edgex_pos + paradex_pos) < 0.0001:
            print("\n✅ 持仓完美对冲")
        else:
            print("\n⚠️  持仓不对冲，存在风险敞口")

        await edgex.close()

    except Exception as e:
        print(f"❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        await edgex.close()

if __name__ == "__main__":
    asyncio.run(check_positions())
