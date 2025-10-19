#!/usr/bin/env python3
"""
完整验证：EdgeX 下单 + 成交记录查询 + 价格验证
"""
import asyncio
import sys
import os
import time

sys.path.insert(0, '/root/edgex-python-sdk')

from edgex_sdk import Client, OrderSide, OrderFillTransactionParams


async def test_edgex_full_flow():
    # 加载环境变量
    from dotenv import load_dotenv
    load_dotenv('/root/aster-bot/.env.edgex')

    account_id = os.getenv('EDGEX_ACCOUNT_ID')
    stark_private_key = os.getenv('EDGEX_STARK_PRIVATE_KEY')
    base_url = os.getenv('EDGEX_BASE_URL', 'https://pro.edgex.exchange')

    print(f"🔌 连接 EdgeX: {base_url}")
    print(f"   账户ID: {account_id}")
    print("=" * 60)

    # 初始化客户端
    client = Client(
        account_id=int(account_id),
        stark_private_key=stark_private_key,
        base_url=base_url
    )

    contract_id = "10000001"  # BTC-USD-PERP
    size = "0.02"
    side = OrderSide.BUY

    print(f"\n📝 测试下单: {side.name} {size} BTC")
    print("=" * 60)

    order_id = None
    api_error = None
    submit_time = int(time.time() * 1000)

    # 1. 下单
    try:
        result = await client.create_market_order(
            contract_id=contract_id,
            size=size,
            side=side
        )

        print(f"✅ API 调用成功")
        print(f"📦 返回数据: {result}")

        order_id = result.get('data', {}).get('orderId')
        print(f"   order_id: {order_id}")
        print(f"   order_id 类型: {type(order_id)}")

    except Exception as e:
        api_error = str(e)
        print(f"⚠️  API 返回异常: {api_error}")

    # 2. 等待成交
    print(f"\n⏳ 等待 3 秒...")
    await asyncio.sleep(3)

    # 3. 查询成交记录
    print(f"\n🔍 查询成交记录...")
    print("=" * 60)

    max_retries = 5
    retry_delay = 3.0

    for retry in range(max_retries):
        if retry > 0:
            print(f"\n⏳ 等待 {retry_delay} 秒后重试 ({retry+1}/{max_retries})...")
            await asyncio.sleep(retry_delay)

        # 根据是否有 order_id 选择查询方式
        if order_id:
            print(f"✅ 使用 order_id 查询: {order_id}")
            fill_params = OrderFillTransactionParams(
                size="20",
                filter_order_id_list=[order_id]
            )
        else:
            print(f"⚠️  无 order_id，使用时间范围查询")
            time_start = submit_time - 5000
            time_end = int(time.time() * 1000)
            fill_params = OrderFillTransactionParams(
                size="20",
                filter_contract_id_list=[contract_id],
                filter_start_created_time_inclusive=time_start,
                filter_end_created_time_exclusive=time_end
            )
            print(f"   时间范围: {time_start} ~ {time_end}")

        try:
            fill_result = await client.get_order_fill_transactions(fill_params)

            if fill_result.get("code") == "SUCCESS":
                fill_list = fill_result.get("data", {}).get("dataList", [])
                print(f"\n📋 API 返回 {len(fill_list)} 条成交记录")

                if fill_list:
                    # 显示前3条的 order_id
                    print(f"\n前3条成交的 orderId:")
                    for i, f in enumerate(fill_list[:3], 1):
                        print(f"  {i}. {f.get('orderId')} (类型: {type(f.get('orderId'))})")

                    # 4. 过滤当前订单的成交
                    print(f"\n🔍 过滤测试:")
                    if order_id:
                        print(f"   目标 order_id: {order_id} (类型: {type(order_id)})")
                        # ✅ 确保类型一致
                        order_id_str = str(order_id)
                        current_order_fills = [f for f in fill_list if str(f.get('orderId')) == order_id_str]
                    else:
                        # 时间范围查询，取最新订单
                        sorted_fills = sorted(fill_list, key=lambda x: x.get('createdTime', 0), reverse=True)
                        latest_order_id = sorted_fills[0].get('orderId') if sorted_fills else None
                        current_order_fills = [f for f in sorted_fills if f.get('orderId') == latest_order_id]
                        print(f"   最新订单 ID: {latest_order_id}")

                    print(f"   过滤后匹配: {len(current_order_fills)} 条")

                    if current_order_fills:
                        print(f"\n✅ 成功！找到当前订单的成交:")

                        total_size = 0.0
                        total_value = 0.0
                        total_fee = 0.0

                        for i, fill in enumerate(current_order_fills, 1):
                            fill_size = float(fill.get('fillSize', 0))
                            fill_price = float(fill.get('fillPrice', 0))
                            fill_fee = float(fill.get('fillFee', 0))
                            fill_value = float(fill.get('fillValue', 0))

                            total_size += fill_size
                            total_value += fill_value
                            total_fee += fill_fee

                            print(f"\n  成交 #{i}:")
                            print(f"    orderId: {fill.get('orderId')}")
                            print(f"    fillSize (原始): {fill.get('fillSize')} (类型: {type(fill.get('fillSize'))})")
                            print(f"    fillPrice (原始): {fill.get('fillPrice')} (类型: {type(fill.get('fillPrice'))})")
                            print(f"    fillValue (原始): {fill.get('fillValue')} (类型: {type(fill.get('fillValue'))})")
                            print(f"    fillFee (原始): {fill.get('fillFee')} (类型: {type(fill.get('fillFee'))})")
                            print(f"    fillSize (float): {fill_size}")
                            print(f"    fillPrice (float): ${fill_price:.2f}")
                            print(f"    fillValue (float): ${fill_value:.2f}")
                            print(f"    fillFee (float): ${fill_fee:.6f}")
                            print(f"    direction: {fill.get('direction')}")
                            print(f"    createdTime: {fill.get('createdTime')}")

                        # 加权平均价格
                        avg_price = total_value / total_size if total_size > 0 else 0

                        print(f"\n📊 累计统计:")
                        print(f"   总成交量: {total_size} BTC")
                        print(f"   总成交额: ${total_value:.2f}")
                        print(f"   加权均价: ${avg_price:.2f}")
                        print(f"   总手续费: ${total_fee:.6f}")

                        # 验证数量是否匹配
                        if abs(total_size - float(size)) < 0.0001:
                            print(f"\n✅ 验证通过：成交数量匹配下单数量 ({size} BTC)")
                        else:
                            print(f"\n❌ 验证失败：成交数量 {total_size} != 下单数量 {size}")

                        print("\n" + "=" * 60)
                        print("✅ 测试完成")
                        return  # 成功，退出

                    else:
                        print(f"\n⚠️  第 {retry+1} 次查询：未找到匹配的成交记录")
                else:
                    print(f"\n⚠️  第 {retry+1} 次查询：API 返回空列表")
            else:
                print(f"\n⚠️  第 {retry+1} 次查询失败: {fill_result.get('msg')}")

        except Exception as e:
            print(f"\n❌ 查询异常: {e}")

    print("\n❌ 重试 {max_retries} 次后仍未找到成交")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_edgex_full_flow())
