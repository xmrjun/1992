#!/usr/bin/env python3
import time
import hmac
import hashlib
import requests
from urllib.parse import urlencode

# API配置
api_key = "661402380167807119"
api_secret = "007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2"
base_url = "https://pro.edgex.exchange"

path = "/api/v1/private/account/getAccountAsset"
timestamp = str(int(time.time() * 1000))

# 参数
params = {"accountId": api_key}
sorted_params = sorted(params.items())
param_string = urlencode(sorted_params)

# 按照market-making-bot格式创建签名字符串
sign_message = f"{timestamp}GET{path}{param_string}"

print("签名字符串:", sign_message)

# 使用SHA256而不是SHA3-256
signature = hmac.new(
    api_secret.encode('utf-8'),
    sign_message.encode('utf-8'),
    hashlib.sha256
).hexdigest()

print("SHA256签名:", signature)

headers = {
    "Content-Type": "application/json",
    "X-edgeX-Api-Key": api_key,
    "X-edgeX-Api-Timestamp": timestamp,
    "X-edgeX-Api-Signature": signature
}

print("请求头:", headers)

url = f"{base_url}{path}"
response = requests.get(url, params=params, headers=headers, timeout=10)
print(f"状态码: {response.status_code}")
print(f"响应: {response.text}")