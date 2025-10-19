#!/usr/bin/env python3
"""
Paradex WebSocket 服务
提供实时价格数据流，供 TypeScript 套利机器人使用
基于官方 paradex_py SDK
"""

import asyncio
import json
import sys
import os
import logging
import time
from datetime import datetime

# 添加 paradex_py 路径
sys.path.insert(0, '/root/paradex-py')

from paradex_py import ParadexSubkey
from paradex_py.api.ws_client import ParadexWebsocketChannel
from paradex_py.environment import Environment


class ParadexWSService:
    """Paradex WebSocket 服务类"""

    def __init__(self, l2_address: str, l2_private_key: str, market: str = "BTC-USD-PERP", testnet: bool = False):
        self.l2_address = l2_address
        self.l2_private_key = l2_private_key
        self.market = market
        self.env = 'testnet' if testnet else 'prod'
        self.paradex = None
        self.last_price = 0
        self.orderbook = None  # 存储最新的订单簿数据

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

    async def on_bbo_update(self, ws_channel, message):
        """BBO (Best Bid/Offer) 价格更新回调 - 直接推送（订单簿由 REST API 提供）"""
        try:
            # 只输出一次确认消息
            if not hasattr(self, '_bbo_received'):
                self.logger.info(f"✅ BBO WebSocket 回调已触发! channel={ws_channel}")
                self._bbo_received = True

            params = message.get("params", {})
            data = params.get("data", {})

            # 提取价格信息
            bid = float(data.get("bid", 0))
            ask = float(data.get("ask", 0))
            bid_size = float(data.get("bid_size", 0))
            ask_size = float(data.get("ask_size", 0))

            # 计算中间价
            mid_price = (bid + ask) / 2 if bid > 0 and ask > 0 else 0

            if mid_price > 0 and mid_price != self.last_price:
                self.last_price = mid_price

                # ✅ 直接推送，订单簿由 REST API 轮询提供
                self.output("price_update", {
                    "market": self.market,
                    "bid": bid,
                    "ask": ask,
                    "mid": mid_price,
                    "bid_size": bid_size,
                    "ask_size": ask_size,
                    "spread": ask - bid,
                    "orderbook": self.orderbook  # REST API 提供
                })

        except Exception as e:
            self.logger.error(f"❌ BBO处理错误: {e}", exc_info=True)

    async def on_trades_update(self, ws_channel, message):
        """交易数据更新回调"""
        try:
            params = message.get("params", {})
            data = params.get("data", {})

            self.output("trade_update", {
                "market": self.market,
                "data": data
            })

        except Exception as e:
            self.logger.error(f"❌ 交易数据处理错误: {e}")

    async def on_orderbook_update(self, ws_channel, message):
        """订单簿更新回调 - WebSocket 方式"""
        try:
            # 只输出一次确认消息
            if not hasattr(self, '_orderbook_received'):
                self.logger.info(f"✅ ORDER_BOOK WebSocket 回调已触发! channel={ws_channel}")
                self._orderbook_received = True

            params = message.get("params", {})
            data = params.get("data", {})

            # 获取订单簿数据（取前5档）
            bids_raw = data.get("bids", [])[:5]
            asks_raw = data.get("asks", [])[:5]

            # 转换格式: Paradex 格式 [["99000", "0.5"], ...] → [[99000, 0.5], ...]
            bids = [[float(b[0]), float(b[1])] for b in bids_raw if len(b) >= 2]
            asks = [[float(a[0]), float(a[1])] for a in asks_raw if len(a) >= 2]

            if len(bids) >= 5 and len(asks) >= 5:
                self.orderbook = {
                    "bids": bids,
                    "asks": asks
                }

                # ✅ 推送实时 price_update（100ms 刷新）
                bid_price = bids[0][0]
                ask_price = asks[0][0]
                mid_price = (bid_price + ask_price) / 2

                self.last_price = mid_price
                self.output("price_update", {
                    "market": self.market,
                    "bid": bid_price,
                    "ask": ask_price,
                    "mid": mid_price,
                    "last_price": mid_price,
                    "orderbook": self.orderbook,
                    "timestamp": int(time.time() * 1000)
                })

                # 仅第一次或深度变化时输出日志
                if len(bids) != getattr(self, '_last_bid_count_ws', 0):
                    self.logger.info(f"✅ WebSocket 订单簿: {len(bids)} 档买单, {len(asks)} 档卖单")
                    self._last_bid_count_ws = len(bids)

        except Exception as e:
            self.logger.error(f"❌ WebSocket 订单簿处理错误: {e}", exc_info=True)

    async def poll_orderbook_rest(self):
        """
        ✅ 使用 REST API 定期拉取订单簿（主要数据源）
        参照 1991 bot 的轮询模式
        """
        try:
            self.logger.info("🔄 启动 REST API 订单簿轮询...")

            # 初始延迟，等待 paradex 初始化
            await asyncio.sleep(2)

            while True:
                try:
                    if not self.paradex:
                        await asyncio.sleep(1)
                        continue

                    # 使用 Paradex REST API 获取订单簿（5档更快更精准）
                    # 正确的方法名是 fetch_orderbook (没有下划线)
                    response = self.paradex.api_client.fetch_orderbook(self.market, params={"depth": 5})

                    if response and isinstance(response, dict):
                        bids_raw = response.get("bids", [])
                        asks_raw = response.get("asks", [])

                        # 转换格式: Paradex 格式 [["99000", "0.5"], ...] → [[99000, 0.5], ...]
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

                            # ✅ 计算价格并推送 price_update（替代 WebSocket BBO）
                            bid_price = bids[0][0]
                            ask_price = asks[0][0]
                            mid_price = (bid_price + ask_price) / 2

                            # 每次都推送，确保主程序知道数据是新鲜的
                            if mid_price > 0:
                                self.last_price = mid_price
                                self.output("price_update", {
                                    "market": self.market,
                                    "bid": bid_price,
                                    "ask": ask_price,
                                    "mid": mid_price,
                                    "bid_size": bids[0][1],
                                    "ask_size": asks[0][1],
                                    "spread": ask_price - bid_price,
                                    "orderbook": self.orderbook
                                })
                        else:
                            self.logger.warning(f"⚠️  订单簿深度不足: {len(bids)} bids, {len(asks)} asks")

                    await asyncio.sleep(0.5)  # 每 500ms 拉取一次（更快响应）

                except Exception as e:
                    self.logger.error(f"❌ REST 订单簿拉取失败: {e}")
                    await asyncio.sleep(5)  # 失败后等待 5 秒重试

        except Exception as e:
            self.logger.error(f"❌ REST 轮询任务崩溃: {e}", exc_info=True)

    async def on_account_update(self, ws_channel, message):
        """账户更新回调（私有频道）"""
        try:
            params = message.get("params", {})
            data = params.get("data", {})

            self.output("account_update", {
                "data": data
            })

            self.logger.info(f"💰 账户更新: {data}")

        except Exception as e:
            self.logger.error(f"❌ 账户更新处理错误: {e}")

    async def on_positions_update(self, ws_channel, message):
        """持仓更新回调（私有频道）"""
        try:
            params = message.get("params", {})
            data = params.get("data", {})

            self.output("positions_update", {
                "data": data
            })

            self.logger.info(f"📊 持仓更新: {data}")

        except Exception as e:
            self.logger.error(f"❌ 持仓更新处理错误: {e}")

    async def on_orders_update(self, ws_channel, message):
        """订单更新回调（私有频道）"""
        try:
            params = message.get("params", {})
            data = params.get("data", {})

            self.output("orders_update", {
                "data": data
            })

            self.logger.info(f"📋 订单更新: {data}")

        except Exception as e:
            self.logger.error(f"❌ 订单更新处理错误: {e}")

    async def on_fills_update(self, ws_channel, message):
        """成交记录回调（私有频道）"""
        try:
            params = message.get("params", {})
            data = params.get("data", {})

            # 提取成交信息
            fill_info = {
                "id": data.get("id"),
                "order_id": data.get("order_id"),
                "market": data.get("market"),
                "side": data.get("side"),
                "size": float(data.get("size", 0)),
                "price": float(data.get("price", 0)),
                "fee": float(data.get("fee", 0)),
                "fee_token": data.get("fee_token", "USDC"),
                "liquidity": data.get("liquidity"),  # MAKER or TAKER
                "created_at": data.get("created_at")
            }

            self.output("fill_update", fill_info)

            self.logger.info(f"💰 成交记录: {fill_info['side']} {fill_info['size']} @ ${fill_info['price']} | 手续费: ${fill_info['fee']} ({fill_info['liquidity']})")

        except Exception as e:
            self.logger.error(f"❌ 成交记录处理错误: {e}")

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
            elif action == "get_account":
                result = await self.get_account()
                self.output("command_result", {
                    "id": request_id,
                    "action": action,
                    "success": True,
                    "data": result
                })
            elif action == "get_positions":
                result = await self.get_positions(params.get("market"))
                self.output("command_result", {
                    "id": request_id,
                    "action": action,
                    "success": True,
                    "data": result
                })
            elif action == "get_position":
                result = await self.get_position(params.get("market", "BTC-USD-PERP"))
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

    def normalize_order_id(self, order_id):
        """标准化 order_id：统一转为小写无连字符字符串"""
        if order_id is None:
            return None
        # 转为字符串，移除连字符、花括号，转小写
        order_id_str = str(order_id).lower().replace('-', '').replace('{', '').replace('}', '').strip()
        return order_id_str

    async def create_order(self, params: dict):
        """创建订单（市价单或限价单）"""
        from paradex_py.common.order import Order, OrderSide, OrderType
        from decimal import Decimal

        market = params.get("market", self.market)
        side = params.get("side", "BUY").upper()
        size = Decimal(str(params.get("size", "0.005")))
        order_type_str = params.get("type", "MARKET").upper()
        price = params.get("price")

        self.logger.info(f"📝 创建订单: {side} {size} {market} @ {order_type_str}")

        # 转换为 Paradex SDK 的枚举类型
        order_side = OrderSide.Buy if side == "BUY" else OrderSide.Sell
        order_type = OrderType.Market if order_type_str == "MARKET" else OrderType.Limit

        # 创建 Order 对象
        if order_type_str == "MARKET":
            order = Order(
                market=market,
                order_type=order_type,
                order_side=order_side,
                size=size
            )
        else:
            if not price:
                raise ValueError("限价单必须提供价格")
            order = Order(
                market=market,
                order_type=order_type,
                order_side=order_side,
                size=size,
                limit_price=Decimal(str(price))
            )

        # 使用 Paradex SDK 提交订单
        result = self.paradex.api_client.submit_order(order=order)

        order_id = result.get('id')
        self.logger.info(f"✅ 订单已提交: {order_id}")

        # 市价单：等待5秒后查询成交记录（简化逻辑，避免频繁请求）
        if order_type_str == "MARKET" and order_id:
            self.logger.info(f"⏳ 等待 5 秒后查询成交...")

            # ✅ 固定等待 5 秒（给订单足够时间成交）
            await asyncio.sleep(5)

            # ⚠️ Paradex API 不支持按 order_id 查询，只能查最近的成交
            self.logger.info(f"🔍 查询订单 {order_id} 的成交...")
            fills = self.paradex.api_client.fetch_fills(params={
                "market": market,
                "page_size": 20  # 增加数量确保包含当前订单
            })

            if fills and fills.get("results"):
                self.logger.info(f"✅ 查询到成交记录")
            else:
                self.logger.warning(f"⚠️ 未找到成交记录")

            if fills and fills.get("results"):
                fill_list = fills["results"]
                self.logger.info(f"📋 API返回 {len(fill_list)} 条成交记录")

                # ✅ 过滤：只累加当前订单的成交记录（防止累加其他订单）
                # ⚠️ 确保类型一致：使用 normalize_order_id 统一格式
                order_id_normalized = self.normalize_order_id(order_id)
                current_order_fills = [f for f in fill_list if self.normalize_order_id(f.get('order_id')) == order_id_normalized]
                self.logger.info(f"🔍 过滤后属于订单 {order_id} 的成交: {len(current_order_fills)} 条")

                if not current_order_fills:
                    self.logger.error(f"❌ API返回成交记录，但无当前订单的成交: order_id={order_id}")
                    result['fill'] = {'filled': False, 'reason': 'no_matching_fills'}
                    return result

                # 累加所有成交记录（处理拆分成交）
                total_size = Decimal('0')
                total_value = Decimal('0')
                total_fee = Decimal('0')
                liquidity = current_order_fills[0].get('liquidity')

                for fill in current_order_fills:
                    size = Decimal(str(fill.get('size', 0)))
                    price = Decimal(str(fill.get('price', 0)))
                    fee = Decimal(str(fill.get('fee', 0)))

                    total_size += size
                    total_value += size * price
                    total_fee += fee

                # 加权平均价格
                avg_price = total_value / total_size if total_size > 0 else Decimal('0')

                self.logger.info(f"✅ 订单已成交! (拆分{len(current_order_fills)}笔)")
                self.logger.info(f"   成交价格: ${float(avg_price):.2f} (加权平均)")
                self.logger.info(f"   成交数量: {float(total_size)}")
                self.logger.info(f"   手续费: ${float(total_fee):.6f} (方向: {liquidity})")

                # 添加成交信息到结果
                result['fill'] = {
                    'filled': True,
                    'fillPrice': str(avg_price),
                    'fillSize': str(total_size),
                    'fillFee': str(total_fee),
                    'liquidity': liquidity,
                    'fillId': fill_list[0].get('id')
                }
            else:
                # ⚠️ 未找到成交记录
                if order_id:
                    # 有 order_id，说明下单成功，即使查不到成交也返回成功
                    self.logger.warning(f"⚠️ 订单未找到成交记录，但订单已提交 {order_id}，假定成功")
                    result['fill'] = {'filled': True, 'reason': 'order_submitted', 'fillPrice': '0'}
                else:
                    # 没有 order_id，真的失败了
                    self.logger.error(f"❌ 下单失败")
                    result['fill'] = {'filled': False, 'reason': 'no_order_id'}

        return result

    async def cancel_order(self, params: dict):
        """撤销订单"""
        order_id = params.get("order_id")

        self.logger.info(f"🗑️ 撤销订单: {order_id}")

        result = await self.paradex.api_client.orders.cancel(order_id)

        self.logger.info(f"✅ 订单撤销成功")
        return result

    async def get_account(self):
        """获取账户信息"""
        result = await self.paradex.api_client.account.retrieve()
        return result

    async def get_positions(self, market: str = None):
        """获取持仓"""
        result = self.paradex.api_client.fetch_positions()

        # 如果指定了市场，过滤结果
        if market and isinstance(result, dict) and "results" in result:
            results = result["results"]
            filtered = [p for p in results if p.get("market") == market]
            return {"results": filtered}

        return result

    async def get_position(self, market: str = "BTC-USD-PERP"):
        """获取特定市场的持仓数量（净持仓）"""
        result = self.paradex.api_client.fetch_positions()

        # Paradex API 返回格式: {"results": [...]}
        if isinstance(result, dict) and "results" in result:
            positions = result["results"]

            # 查找指定市场的持仓
            for pos in positions:
                if pos.get("market") == market:
                    # ✅ Paradex API 的 size 字段本身就带符号（正数=多头，负数=空头）
                    position = float(pos.get("size", 0))
                    side = pos.get("side")  # "LONG" or "SHORT"

                    return {
                        "market": market,
                        "position": position,  # 直接用 size，它已经带符号了
                        "size": abs(position),
                        "side": side,
                        "entry_price": float(pos.get("avg_entry_price", 0)),
                        "unrealized_pnl": float(pos.get("unrealized_pnl", 0))
                    }

        # 没有持仓返回0
        return {
            "market": market,
            "position": 0,
            "size": 0,
            "side": None,
            "entry_price": 0,
            "unrealized_pnl": 0
        }

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

    async def start(self):
        """启动 WebSocket 服务"""
        try:
            self.logger.info("🚀 启动 Paradex WebSocket 服务...")
            self.logger.info(f"   环境: {self.env}")
            self.logger.info(f"   L2地址: {self.l2_address}")
            self.logger.info(f"   市场: {self.market}")

            # 初始化 Paradex (使用 SubKey 模式)
            self.paradex = ParadexSubkey(
                env=self.env,
                l2_address=self.l2_address,
                l2_private_key=self.l2_private_key,
                logger=self.logger
            )

            self.logger.info(f"✅ Paradex 初始化成功 (SubKey 模式)")
            self.logger.info(f"   L2地址: {hex(self.paradex.account.l2_address)}")

            # 输出初始化成功消息
            self.output("connected", {
                "l2_address": hex(self.paradex.account.l2_address),
                "market": self.market,
                "env": str(self.env)
            })

            # 连接 WebSocket
            is_connected = False
            retry_count = 0
            max_retries = 5

            while not is_connected and retry_count < max_retries:
                self.logger.info(f"🔌 连接 Paradex WebSocket... (尝试 {retry_count + 1}/{max_retries})")
                is_connected = await self.paradex.ws_client.connect()

                if not is_connected:
                    retry_count += 1
                    self.logger.warning(f"⚠️ 连接失败，1秒后重试...")
                    await asyncio.sleep(1)

            if not is_connected:
                self.logger.error("❌ WebSocket 连接失败")
                self.output("error", {"message": "WebSocket连接失败"})
                return

            self.logger.info("✅ WebSocket 连接成功")

            # 订阅公共频道 - BBO（最佳买卖价，最实时）
            await self.paradex.ws_client.subscribe(
                ParadexWebsocketChannel.BBO,
                callback=self.on_bbo_update,
                params={"market": self.market}
            )
            self.logger.info(f"✅ 订阅 BBO 频道: {self.market}")

            # ✅ 尝试 WebSocket ORDER_BOOK（5档更精准）
            await self.paradex.ws_client.subscribe(
                ParadexWebsocketChannel.ORDER_BOOK,
                callback=self.on_orderbook_update,
                params={
                    "market": self.market,
                    "depth": "5",
                    "refresh_rate": "100ms",
                    "price_tick": "1"
                }
            )
            self.logger.info(f"✅ 订阅 ORDER_BOOK 频道: {self.market} (5档@100ms)")

            # 订阅成交数据（可选）
            await self.paradex.ws_client.subscribe(
                ParadexWebsocketChannel.TRADES,
                callback=self.on_trades_update,
                params={"market": self.market}
            )
            self.logger.info(f"✅ 订阅 TRADES 频道: {self.market}")

            # 订阅私有频道（需要认证）
            try:
                # 账户状态
                await self.paradex.ws_client.subscribe(
                    ParadexWebsocketChannel.ACCOUNT,
                    callback=self.on_account_update
                )
                self.logger.info(f"✅ 订阅 ACCOUNT 频道")

                # 持仓更新
                await self.paradex.ws_client.subscribe(
                    ParadexWebsocketChannel.POSITIONS,
                    callback=self.on_positions_update
                )
                self.logger.info(f"✅ 订阅 POSITIONS 频道")

                # 订单更新
                await self.paradex.ws_client.subscribe(
                    ParadexWebsocketChannel.ORDERS,
                    callback=self.on_orders_update,
                    params={"market": self.market}
                )
                self.logger.info(f"✅ 订阅 ORDERS 频道")

                # 成交记录更新（重要：用于捕获实际成交价和手续费）
                await self.paradex.ws_client.subscribe(
                    ParadexWebsocketChannel.FILLS,
                    callback=self.on_fills_update,
                    params={"market": self.market}
                )
                self.logger.info(f"✅ 订阅 FILLS 频道（成交记录）")

            except Exception as e:
                self.logger.warning(f"⚠️ 私有频道订阅失败（可能需要充值激活账户）: {e}")

            self.logger.info("🎯 所有频道订阅完成，开始监听数据...")

            self.output("ready", {"message": "WebSocket服务就绪"})

            # 启动 stdin 监听
            stdin_task = asyncio.create_task(self.listen_stdin())

            # ✅ 启用 REST 轮询（WebSocket orderbook回调未触发）
            poll_task = asyncio.create_task(self.poll_orderbook_rest())

            await asyncio.gather(poll_task, stdin_task)

        except KeyboardInterrupt:
            self.logger.info("⚠️ 收到中断信号，正在关闭...")
            self.output("disconnected", {"message": "服务关闭"})
        except Exception as e:
            self.logger.error(f"❌ 服务错误: {e}", exc_info=True)
            self.output("error", {"message": str(e)})


async def main():
    """主函数"""
    # 从环境变量或参数读取配置（标准 Paradex 配置格式）
    l2_address = os.getenv("PARADEX_L2_ADDRESS", "0x703de2fb6e449e6776903686da648caa07972a8bb5c76abbc95a2002f479172")
    l2_private_key = os.getenv("PARADEX_L2_PRIVATE_KEY", "0x57abc834fead9a4984a557b9cff8d576bf87765f8ec2181d79a7f15e70e46f2")
    market = os.getenv("PARADEX_MARKET", "BTC-USD-PERP")
    testnet = os.getenv("PARADEX_TESTNET", "false").lower() == "true"

    # 创建并启动服务
    service = ParadexWSService(
        l2_address=l2_address,
        l2_private_key=l2_private_key,
        market=market,
        testnet=testnet
    )

    await service.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(json.dumps({"type": "shutdown", "timestamp": datetime.now().isoformat()}), flush=True)
        sys.exit(0)
