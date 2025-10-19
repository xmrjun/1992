#!/usr/bin/env python3
"""
测试EdgeX官方Python SDK
"""
import asyncio
import os
import sys

# 添加Python SDK路径
sys.path.insert(0, '/root/edgex-python-sdk')

from edgex_sdk import Client

async def main():
    # 从环境变量读取配置
    base_url = "https://pro.edgex.exchange"
    account_id = int("662340834011644921")
    stark_private_key = "027c7aff32bde4adfd9e4fbd1315c47fe8af00923e73243c3496b904d19b39f5"

    print("🧪 EdgeX官方Python SDK测试")
    print("="*50)
    print(f"📋 配置信息:")
    print(f"   账户ID: {account_id}")
    print(f"   Stark私钥前缀: {stark_private_key[:16]}...")
    print(f"   API地址: {base_url}")
    print()

    # 创建客户端
    client = Client(
        base_url=base_url,
        account_id=account_id,
        stark_private_key=stark_private_key
    )

    # 测试1: 获取账户余额
    print("📊 测试 1: 获取账户余额")
    print("-" * 50)
    try:
        balance_result = await client.get_account_asset()
        print(f"✅ 余额查询成功:")
        print(f"   {balance_result}")
    except Exception as e:
        print(f"❌ 余额查询失败: {e}")
    print()

    # 测试2: 获取持仓
    print("📊 测试 2: 获取持仓信息")
    print("-" * 50)
    try:
        positions_result = await client.get_account_positions()
        print(f"✅ 持仓查询成功:")
        if positions_result.get('data'):
            positions = positions_result['data'].get('positionList', [])
            print(f"   持仓数量: {len(positions)}")
            for pos in positions[:3]:  # 只显示前3个
                print(f"   - {pos.get('symbol')}: {pos.get('size')} @ {pos.get('entryPrice')}")
        else:
            print(f"   {positions_result}")
    except Exception as e:
        print(f"❌ 持仓查询失败: {e}")
    print()

    # 测试3: 获取元数据
    print("📊 测试 3: 获取交易所元数据")
    print("-" * 50)
    try:
        metadata_result = await client.get_metadata()
        print(f"✅ 元数据查询成功:")
        if metadata_result.get('data'):
            contracts = metadata_result['data'].get('contractList', [])
            print(f"   合约数量: {len(contracts)}")
            for contract in contracts[:3]:  # 只显示前3个
                print(f"   - {contract.get('contractId')}: {contract.get('symbol')}")
        else:
            print(f"   {metadata_result}")
    except Exception as e:
        print(f"❌ 元数据查询失败: {e}")
    print()

    print("🎉 测试完成！")

if __name__ == "__main__":
    asyncio.run(main())
