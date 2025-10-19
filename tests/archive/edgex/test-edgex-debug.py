#!/usr/bin/env python3
import time
import hmac
import hashlib
import requests

# API配置 - 使用你提供的值
api_key = "661402380167807119"
api_secret = "007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2"
public_key = "043453513f0c1ac9c13e50f363fac99bb2816faaabc92a82329a6e096f96324d"
account_id = "661402380167807119"
base_url = "https://pro.edgex.exchange"

path = "/api/v1/private/account/getAccountAsset"
timestamp = str(int(time.time() * 1000))

# 创建签名
params = {"accountId": account_id}
query_string = "&".join([f"{k}={v}" for k, v in sorted(params.items())])
sign_message = f"{timestamp}GET{path}?{query_string}"

print("签名字符串:", sign_message)

signature = hmac.new(
    api_secret.encode('utf-8'),
    sign_message.encode('utf-8'),
    hashlib.sha3_256
).hexdigest()

print("签名:", signature)

headers = {
    "X-edgeX-Api-Key": api_key,
    "X-edgeX-Timestamp": timestamp,
    "X-edgeX-Signature": signature,
    "X-edgeX-Passphrase": public_key,
    "Content-Type": "application/json"
}

print("请求头:", headers)

url = f"{base_url}{path}"
print(f"请求URL: {url}")
print(f"请求参数: {params}")

response = requests.get(url, params=params, headers=headers, timeout=10)
print(f"状态码: {response.status_code}")
print(f"响应: {response.text}")