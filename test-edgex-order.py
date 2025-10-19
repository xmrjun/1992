#!/usr/bin/env python3
"""
测试 EdgeX 下单，查看返回数据
"""
import asyncio
import sys
import os
import json
import time

sys.path.insert(0, '/root/edgex-python-sdk')

from edgex_sdk import Client, OrderSide

async def test_edgex_order():
    # 从环境变量加载
    account_id = os.getenv('EDGEX_ACCOUNT_ID')
    stark_private_key = os.getenv('EDGEX_STARK_PRIVATE_KEY')
    base_url = os.getenv('EDGEX_BASE_URL', 'https://pro.edgex.exchange')

    print(f"🔌 连接 EdgeX: {base_url}")
    print(f"   账户ID: {account_id}")

    # 初始化客户端
    client = Client(
        account_id=int(account_id),
        stark_private_key=stark_private_key,
        base_url=base_url
    )

    # 测试下单金额
    test_amount = "0.02"  # 和配置一样
    contract_id = "10000001"  # BTC-USD-PERP

    print(f"\n📝 测试下单: BUY {test_amount} BTC")
    print("=" * 60)

    order_result = None
    order_id = None
    api_error = None
    submit_time = int(time.time() * 1000)

    try:
        # 调用下单 API
        order_result = await client.create_market_order(
            contract_id=contract_id,
            size=test_amount,
            side=OrderSide.BUY
        )

        print("\n✅ API 调用成功")
        print(f"📦 返回数据类型: {type(order_result)}")
        print(f"📦 返回数据:\n{json.dumps(order_result, indent=2, ensure_ascii=False)}")

        order_id = order_result.get('data', {}).get('orderId')
        print(f"\n🆔 订单ID: {order_id}")

    except Exception as e:
        api_error = str(e)
        print(f"\n❌ API 调用异常: {api_error}")
        print(f"📦 异常类型: {type(e)}")

        # 检查是否有部分数据
        if order_result:
            print(f"📦 异常前的 order_result:\n{json.dumps(order_result, indent=2, ensure_ascii=False)}")

    print("\n" + "=" * 60)
    print("🔍 查询成交记录...")
    print("=" * 60)

    # 无论成功失败，都尝试查询成交记录
    from edgex_sdk import OrderFillTransactionParams

    if order_id:
        print(f"\n✅ 有订单ID，使用 order_id 查询: {order_id}")
        fill_params = OrderFillTransactionParams(
            size="20",
            filter_order_id_list=[order_id]
        )
    else:
        print(f"\n⚠️  无订单ID，使用时间范围查询")
        time_start = submit_time - 5000
        time_end = int(time.time() * 1000)
        print(f"   时间范围: {time_start} ~ {time_end}")

        fill_params = OrderFillTransactionParams(
            size="20",
            filter_contract_id_list=[contract_id],
            filter_start_created_time_inclusive=time_start,
            filter_end_created_time_exclusive=time_end
        )

    # 等待3秒让订单处理
    print("\n⏳ 等待 3 秒...")
    await asyncio.sleep(3)

    try:
        fill_result = await client.get_order_fill_transactions(fill_params)

        print("\n✅ 成交记录查询成功")
        print(f"📦 查询结果:\n{json.dumps(fill_result, indent=2, ensure_ascii=False)}")

        fill_list = fill_result.get("data", {}).get("dataList", [])
        print(f"\n📋 成交记录数量: {len(fill_list)}")

        if fill_list:
            print("\n✅ 找到成交记录！")
            for i, fill in enumerate(fill_list, 1):
                print(f"\n成交 #{i}:")
                print(f"  订单ID: {fill.get('orderId')}")
                print(f"  合约ID: {fill.get('contractId')}")
                print(f"  方向: {fill.get('direction')}")
                print(f"  数量: {fill.get('fillSize')}")
                print(f"  价格: {fill.get('fillPrice')}")
                print(f"  手续费: {fill.get('fillFee')}")
                print(f"  时间: {fill.get('createdTime')}")
        else:
            print("\n⚠️  未找到成交记录")

    except Exception as e:
        print(f"\n❌ 成交记录查询失败: {e}")

    print("\n" + "=" * 60)
    print("📊 总结")
    print("=" * 60)
    print(f"API 是否报错: {'是' if api_error else '否'}")
    print(f"有订单ID: {'是' if order_id else '否'}")
    print(f"有成交记录: {'是' if fill_list else '否'}")

    if api_error and fill_list:
        print("\n🚨 关键发现：API 报错但订单已成交！")
        print("   这就是导致判断失败的根本原因")
    elif not api_error and fill_list:
        print("\n✅ 正常：API 成功且订单已成交")
    elif api_error and not fill_list:
        print("\n✅ 正常：API 报错且订单未成交")
    else:
        print("\n⚠️  异常：API 成功但订单未成交")

if __name__ == "__main__":
    # 加载环境变量
    from dotenv import load_dotenv
    load_dotenv('/root/aster-bot/.env.edgex')

    asyncio.run(test_edgex_order())
