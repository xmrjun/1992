#!/usr/bin/env python3
"""
测试 Paradex SDK 查询成交记录
"""
import asyncio
import sys
import os
import json
from datetime import datetime

sys.path.insert(0, '/root/paradex-py')

from paradex_py import ParadexSubkey
from paradex_py.environment import Environment


async def test_paradex_fills():
    # 从环境变量加载
    from dotenv import load_dotenv
    load_dotenv('/root/aster-bot/.env.paradex')

    l2_address = os.getenv('PARADEX_L2_ADDRESS')
    l2_private_key = os.getenv('PARADEX_L2_PRIVATE_KEY')

    print(f"🔌 连接 Paradex (SubKey模式)")
    print(f"   L2地址: {l2_address}")

    # 初始化客户端
    paradex = ParadexSubkey(
        env='prod',
        l2_address=l2_address,
        l2_private_key=l2_private_key
    )

    print("\n📊 查询成交记录...")
    print("=" * 60)

    # 1. 查询最近的成交记录
    fills_result = paradex.api_client.fetch_fills(params={
        "market": "BTC-USD-PERP",
        "page_size": 20
    })

    print(f"\n✅ 查询成功")
    print(f"📦 返回结构:")
    print(f"   - next: {fills_result.get('next')}")
    print(f"   - prev: {fills_result.get('prev')}")
    print(f"   - results: {len(fills_result.get('results', []))} 条")

    fills = fills_result.get("results", [])

    if fills:
        print(f"\n📋 最近 {len(fills)} 条成交记录:")
        print("=" * 60)

        for i, fill in enumerate(fills[:5], 1):  # 只显示前5条
            print(f"\n成交 #{i}:")
            print(f"  order_id: {fill.get('order_id')}")
            print(f"  market: {fill.get('market')}")
            print(f"  side: {fill.get('side')}")
            print(f"  size: {fill.get('size')}")
            print(f"  price: {fill.get('price')}")
            print(f"  fee: {fill.get('fee')}")
            print(f"  liquidity: {fill.get('liquidity')}")
            print(f"  created_at: {fill.get('created_at')}")

        # 2. 测试按 order_id 过滤（手动）
        print("\n\n🔍 测试过滤逻辑:")
        print("=" * 60)

        test_order_id = fills[0].get('order_id')
        print(f"目标 order_id: {test_order_id}")

        # 模拟过滤
        matched_fills = [f for f in fills if f.get('order_id') == test_order_id]
        print(f"过滤后匹配: {len(matched_fills)} 条")

        if matched_fills:
            print("\n✅ 过滤成功！匹配的成交:")
            for fill in matched_fills:
                print(f"  - order_id: {fill.get('order_id')}, size: {fill.get('size')}")

        # 3. 检查字段类型
        print("\n\n🔍 字段类型检查:")
        print("=" * 60)
        sample = fills[0]
        print(f"order_id 类型: {type(sample.get('order_id'))} = {sample.get('order_id')}")
        print(f"size 类型: {type(sample.get('size'))} = {sample.get('size')}")
        print(f"price 类型: {type(sample.get('price'))} = {sample.get('price')}")

    else:
        print("\n⚠️  无成交记录")

    print("\n" + "=" * 60)
    print("✅ 测试完成")


if __name__ == "__main__":
    asyncio.run(test_paradex_fills())
