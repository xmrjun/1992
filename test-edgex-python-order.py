#!/usr/bin/env python3
"""
测试 EdgeX Python SDK 下单
"""

import asyncio
import sys
import os

sys.path.insert(0, '/root/edgex-python-sdk')

from edgex_sdk import Client, CreateOrderParams, OrderSide, OrderType


async def test_edgex_order():
    account_id = int(os.getenv("EDGEX_ACCOUNT_ID", "661402380167807119"))
    stark_private_key = os.getenv("EDGEX_STARK_PRIVATE_KEY", "007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2")
    base_url = os.getenv("EDGEX_BASE_URL", "https://pro.edgex.exchange")

    print(f"🔧 初始化 EdgeX 客户端...")
    print(f"   账户ID: {account_id}")
    print(f"   Base URL: {base_url}")

    async with Client(
        base_url=base_url,
        account_id=account_id,
        stark_private_key=stark_private_key
    ) as client:
        print(f"✅ EdgeX 客户端初始化成功\n")

        # 创建市价单
        print(f"📝 测试下单: 买入 0.001 BTC (市价单)")

        result = await client.create_market_order(
            contract_id="10000001",  # BTC-USD-PERP
            size="0.001",
            side=OrderSide.BUY
        )

        print(f"\n📦 EdgeX 下单响应数据:")
        import json
        print(json.dumps(result, indent=2))

        order_id = result.get("data", {}).get("orderId")
        print(f"\n✅ 订单已提交: {order_id}")

        if result.get("code") == "SUCCESS":
            # 等待成交并查询
            print(f"\n🔍 等待成交确认...")
            await asyncio.sleep(0.5)

            from edgex_sdk import OrderFillTransactionParams
            fill_params = OrderFillTransactionParams(
                size="20",
                filter_order_id_list=[order_id]
            )

            fill_result = await client.get_order_fill_transactions(fill_params)

            if fill_result.get("code") == "SUCCESS":
                fill_list = fill_result.get("data", {}).get("dataList", [])

                if fill_list:
                    fill = fill_list[0]
                    print(f"\n📦 EdgeX 成交记录数据:")
                    print(json.dumps(fill, indent=2))

                    print(f"\n✅ 订单已成交!")
                    print(f"   成交价格: ${fill.get('fillPrice')}")
                    print(f"   成交数量: {fill.get('fillSize')}")
                    print(f"   成交金额: ${fill.get('fillValue')}")
                    print(f"   手续费: ${fill.get('fillFee')} ({fill.get('direction')})")
                    print(f"   已实现盈亏: ${fill.get('realizePnl')}")
                else:
                    print(f"\n⚠️ 订单未找到成交记录，可能未成交或延迟")
            else:
                print(f"\n❌ 查询成交记录失败: {fill_result}")
        else:
            print(f"   错误: {result}")


if __name__ == "__main__":
    asyncio.run(test_edgex_order())
