#!/usr/bin/env python3
"""
测试平仓操作 - 对比 EdgeX 和 Paradex 平仓数据
"""

import asyncio
import sys
import os
import json
from decimal import Decimal

sys.path.insert(0, '/root/edgex-python-sdk')
sys.path.insert(0, '/root/paradex-py')

from edgex_sdk import Client, OrderSide, OrderFillTransactionParams
from paradex_py import ParadexSubkey
from paradex_py.common.order import Order, OrderSide as ParadexOrderSide, OrderType


async def test_edgex_close():
    """测试 EdgeX 平仓"""
    print("=" * 60)
    print("🔧 EdgeX 平仓测试")
    print("=" * 60)

    account_id = int(os.getenv("EDGEX_ACCOUNT_ID", "661402380167807119"))
    stark_private_key = os.getenv("EDGEX_STARK_PRIVATE_KEY", "007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2")
    base_url = os.getenv("EDGEX_BASE_URL", "https://pro.edgex.exchange")

    async with Client(
        base_url=base_url,
        account_id=account_id,
        stark_private_key=stark_private_key
    ) as client:
        # 先查询当前持仓
        positions = await client.get_account_positions()
        print(f"\n📊 当前持仓:")
        if positions.get("code") == "SUCCESS":
            pos_list = positions.get("data", {}).get("dataList", [])
            btc_position = None
            for pos in pos_list:
                if pos.get('contractId') == '10000001' and float(pos.get('quantity', 0)) != 0:
                    btc_position = pos
                    print(f"   合约: {pos.get('contractId')}")
                    print(f"   数量: {pos.get('quantity')} (方向: {pos.get('side')})")
                    print(f"   开仓均价: ${pos.get('entryPrice')}")
                    print(f"   未实现盈亏: ${pos.get('unrealisedPnl')}")
                    break

            if not btc_position:
                print(f"   ⚠️ 没有 BTC 持仓，跳过平仓测试")
                return None

            # 平仓（反向下单）
            position_size = abs(float(btc_position.get('quantity', 0)))
            position_side = btc_position.get('side')
            close_side = OrderSide.SELL if position_side == 'LONG' else OrderSide.BUY

            print(f"\n📝 平仓操作: {close_side.value} {position_size} BTC")

            result = await client.create_market_order(
                contract_id="10000001",
                size=str(position_size),
                side=close_side
            )

            print(f"\n📦 EdgeX 平仓下单响应:")
            print(json.dumps(result, indent=2))

            order_id = result.get("data", {}).get("orderId")
            print(f"\n✅ 平仓订单已提交: {order_id}")

            # 等待成交
            print(f"\n🔍 等待成交确认...")
            await asyncio.sleep(0.5)

            fill_params = OrderFillTransactionParams(
                size="20",
                filter_order_id_list=[order_id]
            )

            fill_result = await client.get_order_fill_transactions(fill_params)

            if fill_result.get("code") == "SUCCESS":
                fill_list = fill_result.get("data", {}).get("dataList", [])

                if fill_list:
                    fill = fill_list[0]
                    print(f"\n📦 EdgeX 平仓成交数据:")
                    print(json.dumps(fill, indent=2))

                    print(f"\n✅ 平仓已成交!")
                    print(f"   成交价格: ${fill.get('fillPrice')}")
                    print(f"   成交数量: {fill.get('fillSize')}")
                    print(f"   成交金额: ${fill.get('fillValue')}")
                    print(f"   手续费: ${fill.get('fillFee')} ({fill.get('direction')})")
                    print(f"   已实现盈亏: ${fill.get('realizePnl')} ⭐")

                    return fill

            print(f"\n⚠️ 未找到平仓成交记录")
            return None


async def test_paradex_close():
    """测试 Paradex 平仓"""
    print("\n" + "=" * 60)
    print("🔧 Paradex 平仓测试")
    print("=" * 60)

    l2_address = "0x703de2fb6e449e6776903686da648caa07972a8bb5c76abbc95a2002f479172"
    l2_private_key = os.getenv("PARADEX_L2_PRIVATE_KEY", "0x57abc834fead9a4984a557b9cff8d576bf87765f8ec2181d79a7f15e70e46f2")
    env = 'prod'

    paradex = ParadexSubkey(
        env=env,
        l2_address=l2_address,
        l2_private_key=l2_private_key
    )

    # 查询当前持仓
    positions = paradex.api_client.fetch_positions()
    print(f"\n📊 当前持仓:")

    btc_position = None
    if positions and positions.get("results"):
        for pos in positions["results"]:
            if pos.get('market') == 'BTC-USD-PERP' and float(pos.get('size', 0)) != 0:
                btc_position = pos
                print(f"   市场: {pos.get('market')}")
                print(f"   数量: {pos.get('size')} (方向: {pos.get('side')})")
                print(f"   开仓均价: ${pos.get('entry_price')}")
                print(f"   未实现盈亏: ${pos.get('unrealized_pnl')}")
                break

    if not btc_position:
        print(f"   ⚠️ 没有 BTC 持仓，跳过平仓测试")
        return None

    # 平仓（反向下单 + reduce_only）
    position_size = abs(Decimal(str(btc_position.get('size', 0))))
    position_side = btc_position.get('side')
    close_side = ParadexOrderSide.Sell if position_side == 'LONG' else ParadexOrderSide.Buy

    print(f"\n📝 平仓操作: {close_side.value} {position_size} BTC (reduce_only=True)")

    order = Order(
        market="BTC-USD-PERP",
        order_type=OrderType.Market,
        order_side=close_side,
        size=position_size,
        reduce_only=True  # ⭐ 平仓标记
    )

    result = paradex.api_client.submit_order(order=order)

    print(f"\n📦 Paradex 平仓下单响应:")
    print(json.dumps(result, indent=2))

    order_id = result.get('id')
    print(f"\n✅ 平仓订单已提交: {order_id}")

    if order_id:
        # 等待成交
        print(f"\n🔍 等待成交确认...")
        await asyncio.sleep(1.0)

        fills = paradex.api_client.fetch_fills(params={
            "order_id": order_id,
            "page_size": 10
        })

        if fills and fills.get("results"):
            fill = fills["results"][0]
            print(f"\n📦 Paradex 平仓成交数据:")
            print(json.dumps(fill, indent=2))

            print(f"\n✅ 平仓已成交!")
            print(f"   成交价格: ${fill.get('price')}")
            print(f"   成交数量: {fill.get('size')}")
            print(f"   手续费: ${fill.get('fee')} ({fill.get('liquidity')})")
            print(f"   已实现盈亏: ${fill.get('realized_pnl')} ⭐")
            print(f"   资金费率: ${fill.get('realized_funding')}")

            return fill

        print(f"\n⚠️ 未找到平仓成交记录")
        return None


async def main():
    """主函数"""
    print("\n" + "🎯" * 30)
    print("平仓操作数据对比测试")
    print("🎯" * 30 + "\n")

    # 测试 EdgeX 平仓
    edgex_fill = await test_edgex_close()

    # 测试 Paradex 平仓
    paradex_fill = await test_paradex_close()

    # 对比总结
    print("\n" + "=" * 60)
    print("📊 平仓数据对比总结")
    print("=" * 60)

    if edgex_fill:
        print(f"\n✅ EdgeX 平仓:")
        print(f"   已实现盈亏: ${edgex_fill.get('realizePnl')}")
        print(f"   手续费: ${edgex_fill.get('fillFee')}")
        print(f"   净盈亏: ${float(edgex_fill.get('realizePnl', 0)) - float(edgex_fill.get('fillFee', 0)):.6f}")

    if paradex_fill:
        print(f"\n✅ Paradex 平仓:")
        print(f"   已实现盈亏: ${paradex_fill.get('realized_pnl')}")
        print(f"   资金费率: ${paradex_fill.get('realized_funding')}")
        print(f"   手续费: ${paradex_fill.get('fee')}")
        total_pnl = float(paradex_fill.get('realized_pnl', 0)) + float(paradex_fill.get('realized_funding', 0)) - float(paradex_fill.get('fee', 0))
        print(f"   净盈亏: ${total_pnl:.6f}")

    print("\n" + "=" * 60)
    print("⭐ 关键发现:")
    print("   - EdgeX: realizePnl 已包含盈亏")
    print("   - Paradex: realized_pnl + realized_funding - fee = 总盈亏")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
