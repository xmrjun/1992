#!/usr/bin/env python3
"""
手动调用 Paradex onboarding
"""

import sys
import os

sys.path.insert(0, '/root/paradex-py')

from paradex_py import Paradex
from paradex_py.account.account import ParadexAccount
from paradex_py.api.api_client import ParadexApiClient


def manual_onboard():
    l1_address = "0x123aAa7Afb675b76c37A2d36CE5eE6179f892d76"
    l2_private_key = "0x57abc834fead9a4984a557b9cff8d576bf87765f8ec2181d79a7f15e70e46f2"
    env = 'prod'

    print(f"🔧 手动 Onboarding...")
    print(f"   环境: {env}")
    print(f"   L1地址: {l1_address}")

    try:
        # 创建账户
        account = ParadexAccount(
            env=env,
            l1_address=l1_address,
            l1_private_key=l2_private_key
        )

        print(f"\n✅ 账户创建成功")
        print(f"   L2地址: {hex(account.l2_address)}")
        print(f"   L2公钥: {hex(account.l2_public_key)}")

        # 创建 API 客户端（不自动 auth）
        api_client = ParadexApiClient(
            env=env,
            auto_auth=False  # 关闭自动认证
        )

        # 手动设置账户
        api_client.account = account

        print(f"\n🔧 调用 onboarding...")

        # 手动调用 onboarding
        try:
            headers = account.onboarding_headers()
            payload = {"public_key": hex(account.l2_public_key)}

            print(f"   Headers: {headers}")
            print(f"   Payload: {payload}")

            result = api_client.post(
                api_url=api_client.api_url,
                path="onboarding",
                headers=headers,
                payload=payload
            )

            print(f"\n✅ Onboarding 成功!")
            print(f"   响应: {result}")

        except Exception as e:
            print(f"\n⚠️ Onboarding 错误: {e}")
            print(f"   这可能是因为账户已经 onboard 过了")

        # 尝试认证
        print(f"\n🔧 尝试认证...")
        try:
            api_client.auth()
            print(f"✅ 认证成功!")

            # 查询账户
            account_summary = api_client.fetch_account_summary()
            print(f"\n✅ 账户信息:")
            print(f"   {account_summary}")

        except Exception as e:
            print(f"❌ 认证失败: {e}")

    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    manual_onboard()
