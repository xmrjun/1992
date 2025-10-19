#!/usr/bin/env python3
"""
完整测试：Paradex 下单 + 成交记录查询 + 过滤验证
"""
import asyncio
import sys
import os
import json

sys.path.insert(0, '/root/paradex-py')

from paradex_py import ParadexSubkey
from paradex_py.common.order import Order, OrderSide, OrderType
from decimal import Decimal


async def test_full_order_flow():
    # 加载环境变量
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

    market = "BTC-USD-PERP"
    size = Decimal("0.02")

    print(f"\n📝 测试下单: {market} SELL {size} BTC")
    print("=" * 60)

    # 1. 下单
    order = Order(
        market=market,
        order_type=OrderType.Market,
        order_side=OrderSide.Sell,
        size=size
    )

    try:
        result = paradex.api_client.submit_order(order=order)
        order_id = result.get('id')

        print(f"✅ 订单已提交")
        print(f"   order_id: {order_id}")
        print(f"   order_id 类型: {type(order_id)}")

    except Exception as e:
        print(f"❌ 下单失败: {e}")
        return

    # 2. 等待成交
    print(f"\n⏳ 等待 3 秒...")
    await asyncio.sleep(3)

    # 3. 查询成交记录
    print(f"\n🔍 查询成交记录...")
    print("=" * 60)

    max_retries = 3
    for retry in range(max_retries):
        if retry > 0:
            print(f"\n⏳ 等待 2 秒后重试 ({retry+1}/{max_retries})...")
            await asyncio.sleep(2)

        # ⚠️ Paradex API 不支持 order_id 参数，只能按 market 查询
        fills_result = paradex.api_client.fetch_fills(params={
            "market": market,
            "page_size": 20
        })

        fill_list = fills_result.get("results", [])
        print(f"\n📋 API 返回 {len(fill_list)} 条成交记录")

        if fill_list:
            # 显示前3条的 order_id
            print(f"\n前3条成交的 order_id:")
            for i, f in enumerate(fill_list[:3], 1):
                print(f"  {i}. {f.get('order_id')} (类型: {type(f.get('order_id'))})")

            # 4. 过滤当前订单的成交
            print(f"\n🔍 过滤测试:")
            print(f"   目标 order_id: {order_id} (类型: {type(order_id)})")

            # ✅ 确保类型一致
            order_id_str = str(order_id)
            current_order_fills = [f for f in fill_list if str(f.get('order_id')) == order_id_str]

            print(f"   过滤后匹配: {len(current_order_fills)} 条")

            if current_order_fills:
                print(f"\n✅ 成功！找到当前订单的成交:")

                total_size = Decimal('0')
                total_value = Decimal('0')
                total_fee = Decimal('0')

                for i, fill in enumerate(current_order_fills, 1):
                    fill_size = Decimal(str(fill.get('size', 0)))
                    fill_price = Decimal(str(fill.get('price', 0)))
                    fill_fee = Decimal(str(fill.get('fee', 0)))

                    total_size += fill_size
                    total_value += fill_size * fill_price
                    total_fee += fill_fee

                    print(f"\n  成交 #{i}:")
                    print(f"    order_id: {fill.get('order_id')}")
                    print(f"    size: {fill.get('size')}")
                    print(f"    price: {fill.get('price')}")
                    print(f"    fee: {fill.get('fee')}")
                    print(f"    liquidity: {fill.get('liquidity')}")

                # 加权平均价格
                avg_price = total_value / total_size if total_size > 0 else Decimal('0')

                print(f"\n📊 累计统计:")
                print(f"   总成交量: {total_size} BTC")
                print(f"   加权均价: ${avg_price:.2f}")
                print(f"   总手续费: ${total_fee:.6f}")

                # 验证数量是否匹配
                if abs(total_size - size) < Decimal('0.0001'):
                    print(f"\n✅ 验证通过：成交数量匹配下单数量 ({size} BTC)")
                else:
                    print(f"\n❌ 验证失败：成交数量 {total_size} != 下单数量 {size}")

                break  # 找到成交，退出重试
            else:
                print(f"\n⚠️  第 {retry+1} 次查询：未找到匹配的成交记录")
                if retry < max_retries - 1:
                    continue
                else:
                    print(f"\n❌ 重试 {max_retries} 次后仍未找到成交")
        else:
            print(f"\n⚠️  第 {retry+1} 次查询：API 返回空列表")

    print("\n" + "=" * 60)
    print("✅ 测试完成")


if __name__ == "__main__":
    asyncio.run(test_full_order_flow())
