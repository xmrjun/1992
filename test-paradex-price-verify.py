#!/usr/bin/env python3
"""
验证 Paradex 成交记录中的价格字段处理
"""
import asyncio
import sys
import os
from decimal import Decimal

sys.path.insert(0, '/root/paradex-py')

from paradex_py import ParadexSubkey


async def test_price_fields():
    from dotenv import load_dotenv
    load_dotenv('/root/aster-bot/.env.paradex')

    l2_address = os.getenv('PARADEX_L2_ADDRESS')
    l2_private_key = os.getenv('PARADEX_L2_PRIVATE_KEY')

    paradex = ParadexSubkey(
        env='prod',
        l2_address=l2_address,
        l2_private_key=l2_private_key
    )

    print("🔍 查询最近成交记录，验证价格字段...")
    print("=" * 60)

    fills_result = paradex.api_client.fetch_fills(params={
        "market": "BTC-USD-PERP",
        "page_size": 5
    })

    fills = fills_result.get("results", [])

    if not fills:
        print("❌ 无成交记录")
        return

    print(f"\n📋 检查 {len(fills)} 条成交记录:\n")

    for i, fill in enumerate(fills, 1):
        print(f"成交 #{i}:")
        print(f"  order_id: {fill.get('order_id')}")

        # 原始数据类型
        size_raw = fill.get('size')
        price_raw = fill.get('price')
        fee_raw = fill.get('fee')

        print(f"  size (原始): {size_raw} (类型: {type(size_raw).__name__})")
        print(f"  price (原始): {price_raw} (类型: {type(price_raw).__name__})")
        print(f"  fee (原始): {fee_raw} (类型: {type(fee_raw).__name__})")

        # 转换为 Decimal
        size_decimal = Decimal(str(size_raw))
        price_decimal = Decimal(str(price_raw))
        fee_decimal = Decimal(str(fee_raw))

        print(f"  size (Decimal): {size_decimal}")
        print(f"  price (Decimal): {price_decimal}")
        print(f"  fee (Decimal): {fee_decimal}")

        # 计算成交金额
        value = size_decimal * price_decimal
        print(f"  成交金额: ${value:.2f}")

        # 验证精度
        print(f"  价格精度保持: {float(price_decimal) == float(price_raw)}")
        print()

    # 测试累加计算
    print("\n" + "=" * 60)
    print("🧮 测试累加计算:")
    print("=" * 60)

    total_size = Decimal('0')
    total_value = Decimal('0')
    total_fee = Decimal('0')

    for fill in fills:
        size = Decimal(str(fill.get('size', 0)))
        price = Decimal(str(fill.get('price', 0)))
        fee = Decimal(str(fill.get('fee', 0)))

        total_size += size
        total_value += size * price
        total_fee += fee

    avg_price = total_value / total_size if total_size > 0 else Decimal('0')

    print(f"总成交量: {total_size} BTC")
    print(f"总成交额: ${total_value:.2f}")
    print(f"加权均价: ${avg_price:.2f}")
    print(f"总手续费: ${total_fee:.6f}")

    print("\n✅ 价格字段处理验证完成")


if __name__ == "__main__":
    asyncio.run(test_price_fields())
