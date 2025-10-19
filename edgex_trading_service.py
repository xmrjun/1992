#!/usr/bin/env python3
"""
EdgeX 交易服务
提供订单创建、撤单等功能，供 TypeScript 套利机器人使用
基于官方 edgex-python-sdk
"""

import asyncio
import json
import sys
import os
import logging
import time
from datetime import datetime

# 添加 EdgeX SDK 路径
sys.path.insert(0, '/root/edgex-python-sdk')

from edgex_sdk import Client, CreateOrderParams, OrderSide, OrderType, CancelOrderParams, WebSocketManager


class EdgeXTradingService:
    """EdgeX 交易服务类"""

    def __init__(self, account_id: str, stark_private_key: str, base_url: str = "https://pro.edgex.exchange", ws_url: str = "wss://quote.edgex.exchange"):
        self.account_id = int(account_id)
        self.stark_private_key = stark_private_key
        self.base_url = base_url
        self.ws_url = ws_url
        self.client = None
        self.ws_manager = None
        self.last_price = 0
        self.orderbook = None  # 存储最新的订单簿数据

        # ✅ 请求限速器（防止 Cloudflare 429）
        # EdgeX API: 2 ops per 2 seconds = 每次请求至少间隔 1 秒
        # 安全起见，设置为 2.5 秒（更保守，避免 Cloudflare 滑动窗口）
        self.last_request_time = 0
        self.min_request_interval = 2.5  # 最小请求间隔 2.5 秒
        self.rate_limit_failures = 0  # 记录连续失败次数（用于指数退避）

        # 配置日志
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            stream=sys.stderr  # 日志输出到 stderr，避免干扰数据流
        )
        self.logger = logging.getLogger(__name__)

    def output(self, message_type: str, data: dict):
        """输出 JSON 消息到 stdout 供 TypeScript 读取"""
        message = {
            "type": message_type,
            "timestamp": datetime.now().isoformat(),
            "data": data
        }
        print(json.dumps(message), flush=True)

    async def _rate_limit(self):
        """请求限速：确保两次请求间隔至少 min_request_interval 秒"""
        now = time.time()
        time_since_last = now - self.last_request_time

        if time_since_last < self.min_request_interval:
            wait_time = self.min_request_interval - time_since_last
            self.logger.debug(f"⏱️ 限速：等待 {wait_time:.2f}s")
            await asyncio.sleep(wait_time)

        self.last_request_time = time.time()

    def get_backoff_delay(self):
        """获取指数退避延迟（Fibonacci 序列）"""
        # Fibonacci: 1, 1, 2, 3, 5, 8, 13, 21...
        fib = [1, 1, 2, 3, 5, 8, 13, 21]
        index = min(self.rate_limit_failures, len(fib) - 1)
        return fib[index]

    async def handle_command(self, command: dict):
        """处理来自 TypeScript 的命令"""
        try:
            action = command.get("action")
            params = command.get("params", {})
            request_id = command.get("id", "unknown")

            if action == "create_order":
                result = await self.create_order(params)
                self.output("command_result", {
                    "id": request_id,
                    "action": action,
                    "success": True,
                    "data": result
                })
            elif action == "cancel_order":
                result = await self.cancel_order(params)
                self.output("command_result", {
                    "id": request_id,
                    "action": action,
                    "success": True,
                    "data": result
                })
            elif action == "get_active_orders":
                result = await self.get_active_orders(params)
                self.output("command_result", {
                    "id": request_id,
                    "action": action,
                    "success": True,
                    "data": result
                })
            elif action == "get_positions":
                result = await self.get_positions(params)
                self.output("command_result", {
                    "id": request_id,
                    "action": action,
                    "success": True,
                    "data": result
                })
            elif action == "get_position":
                result = await self.get_position(params)
                self.output("command_result", {
                    "id": request_id,
                    "action": action,
                    "success": True,
                    "data": result
                })
            elif action == "get_price":
                result = await self.get_price(params)
                self.output("command_result", {
                    "id": request_id,
                    "action": action,
                    "success": True,
                    "data": result
                })
            else:
                self.output("command_result", {
                    "id": request_id,
                    "action": action,
                    "success": False,
                    "error": f"Unknown action: {action}"
                })

        except Exception as e:
            self.logger.error(f"❌ 命令处理错误: {e}", exc_info=True)
            self.output("command_result", {
                "id": request_id,
                "action": action,
                "success": False,
                "error": str(e)
            })

    async def create_order(self, params: dict):
        """创建订单（市价单或限价单）"""
        contract_id = params.get("contract_id", "10000001")  # BTC-USD-PERP
        side = params.get("side", "BUY").upper()
        size = str(params.get("size", "0.001"))
        order_type = params.get("type", "MARKET").upper()
        price = params.get("price")

        self.logger.info(f"📝 创建订单: {side} {size} {contract_id} @ {order_type}")

        # 转换 side 为 OrderSide enum
        order_side = OrderSide.BUY if side == "BUY" else OrderSide.SELL

        order_id = None
        result = {}
        api_error = None
        submit_time = int(time.time() * 1000)  # 记录提交时间（毫秒）

        # ⚠️ 关键修复：捕获 SDK 异常，但继续查询成交记录
        try:
            # ✅ 限速：防止 Cloudflare 429
            await self._rate_limit()

            # 使用 EdgeX SDK 下单
            if order_type == "MARKET":
                # 市价单使用便捷方法（自动计算价格）
                result = await self.client.create_market_order(
                    contract_id=contract_id,
                    size=size,
                    side=order_side
                )
            else:
                # 限价单
                if not price:
                    raise ValueError("限价单必须提供价格")

                result = await self.client.create_limit_order(
                    contract_id=contract_id,
                    size=size,
                    price=str(price),
                    side=order_side
                )

            order_id = result.get('data', {}).get('orderId')
            self.logger.info(f"✅ 订单已提交: {order_id}")

            # ✅ 成功后重置失败计数
            self.rate_limit_failures = 0

        except Exception as e:
            api_error = str(e)
            self.logger.warning(f"⚠️ API 返回异常: {api_error}")

            # ✅ 检测是否为 Cloudflare 429 限流错误
            if "429" in api_error or "rate limit" in api_error.lower():
                self.rate_limit_failures += 1
                backoff = self.get_backoff_delay()
                self.logger.error(f"🚫 Cloudflare 限流！连续失败 {self.rate_limit_failures} 次，退避 {backoff}s")
                await asyncio.sleep(backoff)
            else:
                # 重置失败计数
                self.rate_limit_failures = 0

            self.logger.warning(f"⚠️ 即使API报错，订单可能已提交到服务器，尝试查询最近成交记录...")

            # ⚠️ 即使没有 order_id，也尝试查询最近的成交记录
            # 不再抛出异常，让后续逻辑处理

        # 市价单：等待5秒后查询成交记录（简化逻辑，避免频繁请求）
        if order_type == "MARKET":
            self.logger.info(f"⏳ 等待 5 秒后查询成交...")

            # ✅ 固定等待 5 秒（给订单足够时间成交）
            await asyncio.sleep(5)

            # ✅ 限速：防止 Cloudflare 429
            await self._rate_limit()

            from edgex_sdk import OrderFillTransactionParams

            # ✅ 查询成交记录（只查询一次）
            if order_id:
                # 有订单ID，使用订单ID查询（更精确）
                fill_params = OrderFillTransactionParams(
                    size="20",
                    filter_order_id_list=[order_id]
                )
                self.logger.info(f"🔍 查询订单 {order_id} 的成交...")
            else:
                # ⚠️ 无订单ID（API报错情况），使用时间范围查询
                time_start = submit_time - 5000  # 提交前5秒
                time_end = int(time.time() * 1000)  # 当前时间
                fill_params = OrderFillTransactionParams(
                    size="20",
                    filter_contract_id_list=[contract_id],
                    filter_start_created_time_inclusive=time_start,
                    filter_end_created_time_exclusive=time_end
                )
                self.logger.info(f"🔍 时间范围查询: {time_start} ~ {time_end}")

            fill_result = await self.client.get_order_fill_transactions(fill_params)
            fill_list = []

            if fill_result.get("code") == "SUCCESS":
                fill_list = fill_result.get("data", {}).get("dataList", [])
                if fill_list:
                    self.logger.info(f"✅ 查询到成交记录")
                else:
                    self.logger.warning(f"⚠️ 未找到成交记录")
            else:
                # ⚠️ 查询失败（如429），只记录警告，不影响运行
                error_msg = fill_result.get('msg', '未知错误')
                self.logger.warning(f"⚠️ 查询成交记录失败: {error_msg}，不影响运行")

            if fill_list:
                self.logger.info(f"📋 API返回 {len(fill_list)} 条成交记录")

                # ✅ 过滤：只累加当前订单的成交记录（防止累加其他订单）
                if order_id:
                    # 有订单ID，过滤出匹配的成交记录
                    current_order_fills = [f for f in fill_list if str(f.get('orderId')) == str(order_id)]
                    self.logger.info(f"🔍 过滤后属于订单 {order_id} 的成交: {len(current_order_fills)} 条")
                else:
                    # ⚠️ 无订单ID（时间范围查询），取最新的成交记录（按时间倒序，取第一组相同orderId的）
                    # 按创建时间排序（最新的在前）
                    sorted_fills = sorted(fill_list, key=lambda x: x.get('createdTime', 0), reverse=True)
                    if sorted_fills:
                        latest_order_id = sorted_fills[0].get('orderId')
                        current_order_fills = [f for f in sorted_fills if f.get('orderId') == latest_order_id]
                        self.logger.info(f"🔍 时间范围查询，取最新订单 {latest_order_id} 的成交: {len(current_order_fills)} 条")
                    else:
                        current_order_fills = []

                if not current_order_fills:
                    self.logger.error(f"❌ 过滤后无匹配的成交记录")
                    result['fill'] = {'filled': False, 'reason': 'no_matching_fills'}
                    if api_error:
                        raise Exception(f"订单失败: {api_error}")
                    return result

                # 累加所有成交记录（处理拆分成交）
                total_size = 0.0
                total_value = 0.0
                total_fee = 0.0
                total_pnl = 0.0
                avg_price = 0.0
                direction = current_order_fills[0].get('direction')

                for fill in current_order_fills:
                    total_size += float(fill.get('fillSize', 0))
                    total_value += float(fill.get('fillValue', 0))
                    total_fee += float(fill.get('fillFee', 0))
                    total_pnl += float(fill.get('realizePnl', 0))

                # 加权平均价格 = 总金额 / 总数量
                if total_size > 0:
                    avg_price = total_value / total_size

                self.logger.info(f"✅ 订单已成交! (拆分{len(current_order_fills)}笔)")
                self.logger.info(f"   成交价格: ${avg_price:.2f} (加权平均)")
                self.logger.info(f"   成交数量: {total_size}")
                self.logger.info(f"   成交金额: ${total_value:.2f}")
                self.logger.info(f"   手续费: ${total_fee:.6f} ({direction})")
                self.logger.info(f"   已实现盈亏: ${total_pnl:.6f}")

                # ✅ 关键修复：查询到成交记录，说明订单成功，即使之前 API 报错
                if api_error:
                    self.logger.info(f"✅ 虽然 API 报错，但订单已成交，返回成功")

                # 返回包含成交信息的结果
                result['fill'] = {
                    'filled': True,
                    'fillPrice': str(avg_price),
                    'fillSize': str(total_size),
                    'fillValue': str(total_value),
                    'fillFee': str(total_fee),
                    'direction': direction,
                    'realizePnl': str(total_pnl),
                    'fillId': fill_list[0].get('id')
                }
            else:
                # ⚠️ 未找到成交记录
                if order_id:
                    # 有 order_id，说明下单成功，即使查不到成交也返回成功
                    self.logger.warning(f"⚠️ 订单未找到成交记录，但订单已提交 {order_id}，假定成功")
                    result['fill'] = {'filled': True, 'reason': 'order_submitted', 'fillPrice': '0'}
                else:
                    # 没有 order_id 且查不到成交，真的失败了
                    self.logger.error(f"❌ 下单失败且无成交记录")
                    if api_error:
                        raise Exception(f"订单失败: {api_error}")
                    result['fill'] = {'filled': False, 'reason': 'no_order_id_no_fill'}

        return result

    async def cancel_order(self, params: dict):
        """撤销订单"""
        order_id = params.get("order_id")

        self.logger.info(f"🗑️ 撤销订单: {order_id}")

        cancel_params = CancelOrderParams(order_id=order_id)
        result = await self.client.cancel_order(cancel_params)

        self.logger.info(f"✅ 订单撤销成功")
        return result

    async def get_active_orders(self, params: dict):
        """获取活跃订单"""
        from edgex_sdk import GetActiveOrderParams

        query_params = GetActiveOrderParams(
            size=params.get("size", "100")
        )

        result = await self.client.get_active_orders(query_params)
        return result

    async def get_positions(self, params: dict):
        """获取持仓"""
        result = await self.client.get_account_positions()
        return result

    async def get_position(self, params: dict):
        """获取特定合约的持仓数量（净持仓）"""
        contract_id = params.get("contract_id", "10000001")  # BTC-USD-PERP

        # ✅ 限速：防止 Cloudflare 429
        await self._rate_limit()

        result = await self.client.get_account_positions()

        # ✅ 修复：EdgeX API 返回格式为 {"code": "SUCCESS", "data": {...}}
        # 持仓数据在 data.positionList 中，而不是 data 本身
        if not isinstance(result, dict) or result.get("code") != "SUCCESS":
            self.logger.error(f"❌ EdgeX API 返回失败: {result}")
            return {
                "contract_id": contract_id,
                "position": 0,
                "size": 0,
                "side": None,
                "entry_price": 0,
                "unrealized_pnl": 0
            }

        data = result.get("data", {})
        position_list = data.get("positionList", [])

        # 查找指定合约的持仓
        for pos in position_list:
            if pos.get("contractId") == contract_id:
                # openSize 为正=多头，为负=空头
                open_size = float(pos.get("openSize", 0))

                # 计算平均入场价（需要从 positionAssetList 获取）
                avg_entry_price = 0
                unrealized_pnl = 0

                # 从 positionAssetList 获取更详细的信息
                position_asset_list = data.get("positionAssetList", [])
                for asset in position_asset_list:
                    if asset.get("contractId") == contract_id:
                        avg_entry_price = float(asset.get("avgEntryPrice", 0))
                        unrealized_pnl = float(asset.get("unrealizePnl", 0))
                        break

                return {
                    "contract_id": contract_id,
                    "position": open_size,  # 正数=多头，负数=空头
                    "size": abs(open_size),
                    "side": "LONG" if open_size > 0 else "SHORT" if open_size < 0 else None,
                    "entry_price": avg_entry_price,
                    "unrealized_pnl": unrealized_pnl
                }

        # 没有持仓返回0
        return {
            "contract_id": contract_id,
            "position": 0,
            "size": 0,
            "side": None,
            "entry_price": 0,
            "unrealized_pnl": 0
        }

    async def get_price(self, params: dict):
        """获取当前价格"""
        contract_id = params.get("contract_id", "10000001")  # BTC-USD-PERP (默认我们交易的合约)

        # 使用 quote client 获取行情
        result = await self.client.get_quote_summary(contract_id)

        # 提取价格信息
        data = result.get("data", {})

        return {
            "contract_id": contract_id,
            "mark_price": float(data.get("markPrice", 0)),
            "index_price": float(data.get("indexPrice", 0)),
            "best_bid": float(data.get("bestBidPrice", 0)),
            "best_ask": float(data.get("bestAskPrice", 0)),
            "mid": (float(data.get("bestBidPrice", 0)) + float(data.get("bestAskPrice", 0))) / 2,
            "timestamp": data.get("timestamp", 0)
        }

    def handle_ticker(self, message):
        """处理 Ticker 更新 - 直接推送（订单簿由 REST API 提供）

        注意：此回调在 WebSocket 的同步线程中执行，不是 asyncio 事件循环
        """
        try:
            # 如果 message 是字符串，先解析成 JSON
            if isinstance(message, str):
                import json
                message = json.loads(message)

            # EdgeX WebSocket 数据结构: {"type":"quote-event","content":{"data":[{...}]}}
            content = message.get("content", {})
            data_list = content.get("data", [])

            if not data_list:
                self.logger.debug(f"Ticker 数据为空")
                return

            data = data_list[0]  # 取第一条数据
            contract_id = data.get("contractId")

            # 只输出一次确认消息
            if not hasattr(self, '_ticker_received'):
                self.logger.info(f"✅ Ticker WebSocket 回调已触发! contract={contract_id}")
                self._ticker_received = True

            if contract_id == "10000001":  # BTC-USD-PERP (我们交易的合约)
                # 优先使用 bestBidPrice/bestAskPrice (Snapshot时有)
                # 如果没有，使用 lastPrice (changed事件时)
                best_bid = data.get("bestBidPrice")
                best_ask = data.get("bestAskPrice")
                last_price = data.get("lastPrice")

                if best_bid and best_ask:
                    # 有买卖价，计算中间价
                    mid = (float(best_bid) + float(best_ask)) / 2
                elif last_price:
                    # 只有最新价，使用最新价
                    mid = float(last_price)
                else:
                    return

                # 价格变化时才推送
                if mid > 0 and mid != self.last_price:
                    self.last_price = mid

                    # ✅ 直接推送，订单簿由 REST API 轮询提供
                    self.output("price_update", {
                        "contract_id": contract_id,
                        "bid": float(best_bid) if best_bid else mid,
                        "ask": float(best_ask) if best_ask else mid,
                        "mid": mid,
                        "last_price": float(last_price) if last_price else mid,
                        "orderbook": self.orderbook,  # REST API 提供
                        "timestamp": data.get("endTime", 0)
                    })

        except Exception as e:
            self.logger.error(f"❌ Ticker处理错误: {e}", exc_info=True)


    def init_websocket(self):
        """初始化 WebSocket 连接 - 仅订阅 Ticker"""
        try:
            self.logger.info(f"🔗 连接 EdgeX WebSocket: {self.ws_url}")

            # 创建 WebSocket Manager
            self.ws_manager = WebSocketManager(
                base_url=self.ws_url,
                account_id=self.account_id,
                stark_pri_key=self.stark_private_key
            )

            # 连接公开流
            self.ws_manager.connect_public()

            # 订阅 BTC-USD-PERP ticker (contract_id: 10000001) - 我们交易的合约
            self.ws_manager.subscribe_ticker("10000001", self.handle_ticker)

            self.logger.info("✅ EdgeX WebSocket 订阅成功 (BTC-USD-PERP Ticker)")
            self.logger.info("📊 订单簿将通过 REST API 轮询获取")

        except Exception as e:
            self.logger.error(f"❌ WebSocket初始化失败: {e}", exc_info=True)

    async def listen_stdin(self):
        """监听 stdin 接收命令"""
        loop = asyncio.get_running_loop()

        def read_stdin():
            for line in sys.stdin:
                try:
                    command = json.loads(line.strip())
                    # 使用 call_soon_threadsafe 在事件循环中执行
                    asyncio.run_coroutine_threadsafe(self.handle_command(command), loop)
                except json.JSONDecodeError as e:
                    self.logger.error(f"❌ JSON解析失败: {e}")
                except Exception as e:
                    self.logger.error(f"❌ stdin处理错误: {e}")

        # 在单独的线程中读取 stdin
        import threading
        stdin_thread = threading.Thread(target=read_stdin, daemon=True)
        stdin_thread.start()

    async def poll_orderbook_rest(self):
        """
        ✅ 使用 REST API 定期拉取订单簿（主要数据源）
        参照 1991 bot 的轮询模式
        """
        try:
            self.logger.info("🔄 启动 REST API 订单簿轮询...")

            # 初始延迟，等待 client 初始化
            await asyncio.sleep(2)

            while True:
                try:
                    if not self.client:
                        await asyncio.sleep(1)
                        continue

                    # 使用 EdgeX 公开 REST API 获取订单簿（5档更快更精准）
                    import requests
                    response = requests.get(
                        "https://fapi.asterdex.com/fapi/v1/depth",
                        params={"symbol": "BTCUSDT", "limit": 5},
                        timeout=5
                    ).json()

                    if response and isinstance(response, dict):
                        bids_raw = response.get("bids", [])
                        asks_raw = response.get("asks", [])

                        # 转换格式: AsterDex 格式 [["price", "size"], ...] → [[price, size], ...]
                        bids = [[float(b[0]), float(b[1])] for b in bids_raw if len(b) >= 2]
                        asks = [[float(a[0]), float(a[1])] for a in asks_raw if len(a) >= 2]

                        if len(bids) >= 3 and len(asks) >= 3:  # 至少 3 档深度
                            self.orderbook = {
                                "bids": bids,
                                "asks": asks
                            }
                            # 仅第一次或深度变化时输出日志
                            if len(bids) != getattr(self, '_last_bid_count', 0):
                                self.logger.info(f"✅ REST 订单簿: {len(bids)} 档买单, {len(asks)} 档卖单")
                                self._last_bid_count = len(bids)

                            # ✅ 计算价格并推送 price_update（替代 WebSocket ticker）
                            bid_price = bids[0][0]
                            ask_price = asks[0][0]
                            mid_price = (bid_price + ask_price) / 2

                            # 每次都推送，确保主程序知道数据是新鲜的
                            if mid_price > 0:
                                self.last_price = mid_price
                                self.output("price_update", {
                                    "contract_id": "10000001",
                                    "bid": bid_price,
                                    "ask": ask_price,
                                    "mid": mid_price,
                                    "last_price": mid_price,
                                    "orderbook": self.orderbook,
                                    "timestamp": int(time.time() * 1000)
                                })
                        else:
                            self.logger.warning(f"⚠️  订单簿深度不足: {len(bids)} bids, {len(asks)} asks")

                    await asyncio.sleep(0.5)  # 每 500ms 拉取一次（更快响应）

                except Exception as e:
                    self.logger.error(f"❌ REST 订单簿拉取失败: {e}")
                    await asyncio.sleep(5)  # 失败后等待 5 秒重试

        except Exception as e:
            self.logger.error(f"❌ REST 轮询任务崩溃: {e}", exc_info=True)

    async def start(self):
        """启动服务"""
        try:
            self.logger.info("🚀 启动 EdgeX 交易服务...")
            self.logger.info(f"   账户ID: {self.account_id}")
            self.logger.info(f"   Base URL: {self.base_url}")

            # 初始化 EdgeX 客户端
            async with Client(
                base_url=self.base_url,
                account_id=self.account_id,
                stark_private_key=self.stark_private_key
            ) as client:
                self.client = client

                self.logger.info(f"✅ EdgeX 客户端初始化成功")

                # 输出初始化成功消息
                self.output("connected", {
                    "account_id": self.account_id,
                    "base_url": self.base_url
                })

                # 初始化 WebSocket 价格推送
                self.init_websocket()

                # ✅ 启动 REST API 轮询作为备份（WebSocket Depth 不可靠）
                poll_task = asyncio.create_task(self.poll_orderbook_rest())

                self.output("ready", {"message": "EdgeX交易服务就绪"})

                # 启动 stdin 监听（接收交易命令）- 非阻塞
                stdin_task = asyncio.create_task(self.listen_stdin())

                # 等待任务完成
                await asyncio.gather(poll_task, stdin_task)

                # 保持运行
                while True:
                    await asyncio.sleep(1)

        except KeyboardInterrupt:
            self.logger.info("⚠️ 收到中断信号，正在关闭...")
            self.output("disconnected", {"message": "服务关闭"})
        except Exception as e:
            self.logger.error(f"❌ 服务错误: {e}", exc_info=True)
            self.output("error", {"message": str(e)})


async def main():
    """主函数"""
    # 从环境变量读取配置
    account_id = os.getenv("EDGEX_ACCOUNT_ID", "661402380167807119")
    stark_private_key = os.getenv("EDGEX_STARK_PRIVATE_KEY", "007ad61d639a053370df153fdf6f49506cb9cc4bba0fa368399d7ad37185b9a2")
    base_url = os.getenv("EDGEX_BASE_URL", "https://pro.edgex.exchange")
    ws_url = os.getenv("EDGEX_WS_URL", "wss://quote.edgex.exchange")

    # 创建并启动服务
    service = EdgeXTradingService(
        account_id=account_id,
        stark_private_key=stark_private_key,
        base_url=base_url,
        ws_url=ws_url
    )

    await service.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(json.dumps({"type": "shutdown", "timestamp": datetime.now().isoformat()}), flush=True)
        sys.exit(0)
