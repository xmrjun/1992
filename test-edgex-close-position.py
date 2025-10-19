#!/usr/bin/env python3
"""
测试 EdgeX Python SDK 平仓
"""

import asyncio
import sys
import os

sys.path.insert(0, '/root/edgex-python-sdk')

from edgex_sdk import Client, OrderSide, OrderFillTransactionParams


async def test_edgex_close():
    account_id = int(os.getenv("EDGEX_ACCOUNT_ID", "661402380167807119"))
    stark_private_key = os.getenv("EDGEX_STARK_PRIVATE_KEY", "007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2")
    base_url = os.getenv("EDGEX_BASE_URL", "https://pro.edgex.exchange")

    print(f"🔧 初始化 EdgeX 客户端...")
    print(f"   账户ID: {account_id}")

    async with Client(
        base_url=base_url,
        account_id=account_id,
        stark_private_key=stark_private_key
    ) as client:
        print(f"✅ EdgeX 客户端初始化成功\n")

        # 查询当前持仓
        pos_result = await client.get_account_positions()
        pos_list = pos_result.get('data', {}).get('positionList', [])

        btc_position = None
        for pos in pos_list:
            if pos.get('contractId') == '10000001':
                size = float(pos.get('contractSize', 0))
                if size != 0:
                    btc_position = pos
                    break

        if not btc_position:
            print("❌ 没有持仓可平")
            return

        size = float(btc_position.get('contractSize', 0))
        entry_price = btc_position.get('avgEntryPrice')

        print(f"📊 当前持仓:")
        print(f"   方向: {'做多' if size > 0 else '做空'}")
        print(f"   数量: {abs(size)} BTC")
        print(f"   入场价: ${entry_price}")

        # 确定平仓方向
        close_side = OrderSide.SELL if size > 0 else OrderSide.BUY
        close_size = str(abs(size))

        print(f"\n📝 平仓: {close_side.name} {close_size} BTC (市价单)")

        result = await client.create_market_order(
            contract_id="10000001",
            size=close_size,
            side=close_side
        )

        order_id = result.get("data", {}).get("orderId")
        print(f"✅ 订单已提交: {order_id}")

        if result.get("code") == "SUCCESS":
            # 等待成交并查询
            print(f"🔍 等待成交确认...")
            await asyncio.sleep(1.0)

            fill_params = OrderFillTransactionParams(
                size="20",
                filter_order_id_list=[order_id]
            )

            fill_result = await client.get_order_fill_transactions(fill_params)

            if fill_result.get("code") == "SUCCESS":
                fill_list = fill_result.get("data", {}).get("dataList", [])

                if fill_list:
                    fill = fill_list[0]
                    import json
                    print(f"\n📦 EdgeX 成交记录数据:")
                    print(json.dumps(fill, indent=2))

                    print(f"\n💰 平仓成交:")
                    print(f"   成交价格: ${fill.get('fillPrice')}")
                    print(f"   成交数量: {fill.get('fillSize')}")
                    print(f"   成交金额: ${fill.get('fillValue')}")
                    print(f"   手续费: ${fill.get('fillFee')} ({fill.get('direction')})")
                    print(f"   已实现盈亏: ${fill.get('realizePnl')}")

                    # 计算净盈亏
                    pnl = float(fill.get('realizePnl', 0))
                    fee = float(fill.get('fillFee', 0))
                    net_pnl = pnl - fee

                    print(f"\n📊 盈亏统计:")
                    print(f"   已实现盈亏: ${pnl:.6f}")
                    print(f"   手续费: -${fee:.6f}")
                    print(f"   净盈亏: ${net_pnl:.6f} {'💰' if net_pnl > 0 else '📉'}")
                    print(f"\n✅ 平仓完成!")
                else:
                    print(f"\n⚠️ 订单未找到成交记录")
            else:
                print(f"\n❌ 查询成交记录失败: {fill_result}")
        else:
            print(f"❌ 下单失败: {result}")


if __name__ == "__main__":
    asyncio.run(test_edgex_close())
