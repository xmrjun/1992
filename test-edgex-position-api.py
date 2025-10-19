#!/usr/bin/env python3
"""
测试 EdgeX 持仓查询 API
"""
import asyncio
import sys
import os
import json

sys.path.insert(0, '/root/edgex-python-sdk')

from edgex_sdk import Client

async def main():
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

    print("\n📊 查询账户资产...")
    result = await client.get_account_asset()

    print(f"\n✅ 返回数据类型: {type(result)}")
    print(f"✅ 返回数据: {json.dumps(result, indent=2, ensure_ascii=False)}")

    # 检查持仓字段
    if isinstance(result, dict):
        if 'data' in result:
            data = result['data']
            print(f"\n📋 data 字段类型: {type(data)}")

            if 'positionAssetList' in data:
                positions = data['positionAssetList']
                print(f"📋 positionAssetList: {positions}")
            else:
                print("⚠️ 没有找到 positionAssetList 字段")
                print(f"📋 data 的所有字段: {data.keys() if isinstance(data, dict) else 'not a dict'}")
        else:
            print("⚠️ 没有找到 data 字段")
            print(f"📋 result 的所有字段: {result.keys()}")

if __name__ == "__main__":
    # 加载环境变量
    from dotenv import load_dotenv
    load_dotenv('/root/aster-bot/.env.edgex')

    asyncio.run(main())
