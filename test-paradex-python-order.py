#!/usr/bin/env python3
"""
测试 Paradex Python SDK 下单
"""

import asyncio
import sys
import os
from decimal import Decimal

sys.path.insert(0, '/root/paradex-py')

from paradex_py import ParadexSubkey
from paradex_py.common.order import Order, OrderSide, OrderType


async def test_paradex_order():
    # 标准 Paradex 配置
    l2_address = "0x703de2fb6e449e6776903686da648caa07972a8bb5c76abbc95a2002f479172"  # Paradex 地址
    l2_private_key = os.getenv("PARADEX_L2_PRIVATE_KEY", "0x57abc834fead9a4984a557b9cff8d576bf87765f8ec2181d79a7f15e70e46f2")
    env = 'prod'  # 使用主网

    print(f"🔧 初始化 Paradex 客户端 (L2-Only SubKey 模式)...")
    print(f"   环境: {env}")
    print(f"   L2地址: {l2_address}")

    paradex = ParadexSubkey(
        env=env,
        l2_address=l2_address,
        l2_private_key=l2_private_key
    )

    print(f"✅ Paradex 客户端初始化成功")
    print(f"   L2地址: {hex(paradex.account.l2_address)}\n")

    # 创建市价单
    print(f"📝 测试下单: 买入 0.005 BTC (市价单)")

    order = Order(
        market="BTC-USD-PERP",
        order_type=OrderType.Market,
        order_side=OrderSide.Buy,
        size=Decimal("0.005")
    )

    result = paradex.api_client.submit_order(order=order)

    print(f"\n📦 Paradex 下单响应数据:")
    import json
    print(json.dumps(result, indent=2))

    order_id = result.get('id')
    print(f"\n✅ 订单已提交: {order_id}")

    if order_id:
        # 等待成交并查询
        print(f"\n🔍 等待成交确认...")
        await asyncio.sleep(1.0)

        fills = paradex.api_client.fetch_fills(params={
            "order_id": order_id,
            "page_size": 10
        })

        if fills and fills.get("results"):
            fill = fills["results"][0]
            print(f"\n📦 Paradex 成交记录数据:")
            print(json.dumps(fill, indent=2))

            print(f"\n✅ 订单已成交!")
            print(f"   成交价格: ${fill.get('price')}")
            print(f"   成交数量: {fill.get('size')}")
            print(f"   手续费: ${fill.get('fee')} (方向: {fill.get('liquidity')})")
        else:
            print(f"\n⚠️ 订单未找到成交记录")
            print(f"   完整响应: {fills}")
    else:
        print(f"   错误: {result}")


if __name__ == "__main__":
    asyncio.run(test_paradex_order())
