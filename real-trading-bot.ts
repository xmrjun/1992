import { pro as ccxt } from "ccxt";
import dotenv from 'dotenv';

// 明确加载.env文件
dotenv.config();
import { WebSocketPriceManager } from "./websocket-price-manager.js";
import AsterAPI from "./aster-api.js";
import {
  TRADE_SYMBOL,
  TRADE_AMOUNT,
  ARB_THRESHOLD,
  CLOSE_DIFF,
  LEVERAGE,
  MAX_POSITION_SIZE,
  MAX_ADD_POSITIONS,
  ADD_POSITION_SPREAD,
  FORCE_CLOSE_TIME,
  DAILY_VOLUME_TARGET,
  DAILY_TRADES_TARGET,
} from "./config.js";

// 🚀 双WebSocket价格管理器（包含Backpack私有流）
const priceManager = new WebSocketPriceManager(
  process.env.ASTER_API_KEY!,
  process.env.ASTER_API_SECRET!,
  process.env.BACKPACK_API_KEY,
  process.env.BACKPACK_SECRET_KEY
);

// 交易配置 - 混合API
const asterPrivate = new AsterAPI({
  apiKey: process.env.ASTER_API_KEY!,
  secret: process.env.ASTER_API_SECRET!
});

const backpackPrivate = new ccxt.backpack({
  apiKey: process.env.BACKPACK_API_KEY,
  secret: process.env.BACKPACK_SECRET_KEY,
  sandbox: false,
  options: {
    defaultType: 'swap',
  }
});

// 符号转换函数
function getBackpackSymbol(asterSymbol: string): string {
  if (asterSymbol === "BTCUSDT") return "BTC/USDC:USDC";
  if (asterSymbol === "ETHUSDT") return "ETH/USDC:USDC";
  return asterSymbol;
}

// 时间锁管理
let lastTradeTime = 0;
const TRADE_LOCK_DURATION = 3000; // 3秒时间锁

// 检查和等待时间锁
async function waitForTradeLock(): Promise<void> {
  const now = Date.now();
  const timeSinceLastTrade = now - lastTradeTime;

  if (timeSinceLastTrade < TRADE_LOCK_DURATION) {
    const waitTime = TRADE_LOCK_DURATION - timeSinceLastTrade;
    log(`⏰ 时间锁等待 ${waitTime}ms | 上次交易: ${new Date(lastTradeTime).toLocaleTimeString()}`, 'info');
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastTradeTime = Date.now();
}

// 🔄 双WebSocket价格获取函数 - 替代旧的单独实现

// 🚀 获取双WebSocket实时价格
async function getAsterPrice() {
  const asterPrice = priceManager.getAsterPrice();

  if (asterPrice) {
    return {
      bid: asterPrice.bid,
      ask: asterPrice.ask,
      lastPrice: asterPrice.lastPrice,
      source: 'WebSocket'
    };
  } else {
    log('⚠️ AsterDx WebSocket价格无效，使用备用方案', 'warn');
    throw new Error('AsterDx WebSocket price unavailable');
  }
}

async function getBackpackPrice() {
  const backpackPrice = priceManager.getBackpackPrice();

  if (backpackPrice) {
    return {
      bid: backpackPrice.bid,
      ask: backpackPrice.ask,
      lastPrice: backpackPrice.lastPrice,
      source: 'WebSocket'
    };
  } else {
    log('⚠️ Backpack WebSocket价格无效，回退到CCXT', 'warn');
    const backpackSymbol = getBackpackSymbol(TRADE_SYMBOL);
    const backpackTicker = await backpackPrivate.fetchTicker(backpackSymbol);

    if (!backpackTicker?.last) {
      throw new Error('Backpack价格数据不可用');
    }

    return {
      bid: backpackTicker.bid || backpackTicker.last,
      ask: backpackTicker.ask || backpackTicker.last,
      lastPrice: backpackTicker.last,
      source: 'CCXT'
    };
  }
}

// 价格精度修正函数
function fixBackpackPrice(price: number, symbol: string): string {
  if (symbol.includes("ETH")) {
    return (Math.round(price * 100) / 100).toFixed(2); // ETH tickSize: 0.01
  }
  if (symbol.includes("BTC")) {
    return (Math.round(price * 10) / 10).toFixed(1); // BTC tickSize: 0.1
  }
  return price.toFixed(2);
}

// 统计数据 + WebSocket持仓缓存
let stats = {
  dailyVolume: 0,
  dailyTrades: 0,
  dailyProfit: 0,
  positions: [],
  currentGroup: {
    direction: null,
    totalAmount: 0,
    positions: [],
    firstOpenTime: 0,
  },
  // 🔥 WebSocket实时数据缓存
  wsPositions: {
    aster: { amount: 0, side: null, unrealizedPnl: 0, updateTime: 0 },
    backpack: { amount: 0, side: null, unrealizedPnl: 0, updateTime: 0 }
  },
  wsBalances: {
    aster: { available: 0, total: 0, updateTime: 0 },
    backpack: { available: 0, total: 0, updateTime: 0 }
  },
  wsOrders: {
    aster: [],
    backpack: []
  },
  // 🔥 新增：标记价格和资金费率监控
  markPrice: {
    price: 0,
    indexPrice: 0,
    fundingRate: 0,
    nextFundingTime: 0,
    updateTime: 0
  },
  // 🔥 新增：聚合交易流监控（市场情绪分析）
  recentTrades: [] as any[],
  marketSentiment: {
    buyPressure: 0.5,  // 买盘压力（0-1）
    lastUpdate: 0
  }
};

function log(message: string, type = 'info') {
  const timestamp = new Date().toLocaleString();
  const prefix = { info: '📊', success: '✅', error: '❌', warn: '⚠️' }[type] || '📊';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

// 交易锁，防止并发执行
let isTrading = false;

// 获取价格并计算价差
async function checkPricesAndTrade() {
  if (isTrading) {
    log('🔒 交易进行中，跳过本轮检查', 'debug');
    return;
  }

  isTrading = true;
  try {
    // 1. 获取AsterDx价格 (WebSocket优先)
    const asterPrice = await getAsterPrice();
    const asterBid = asterPrice.bid;  // 买价（买单最高价）
    const asterAsk = asterPrice.ask;  // 卖价（卖单最低价）

    // 2. 获取Backpack价格 (WebSocket优先)
    const backpackPrice = await getBackpackPrice();
    const backpackBid = backpackPrice.bid;
    const backpackAsk = backpackPrice.ask;
    const backpackMidPrice = (backpackBid + backpackAsk) / 2;

    // 3. 计算价差 (以Backpack为基准)
    const asterMidPrice = (asterBid + asterAsk) / 2; // AsterDex中间价
    const priceDiff = backpackMidPrice - asterMidPrice; // Backpack价格 - AsterDex价格

    // 4. 显示价格信息 (包含数据源)
    const sourceIcon = asterPrice.source === 'WebSocket' ? '📡' : '🌐';
    const backpackIcon = backpackPrice.source === 'WebSocket' ? '📡' : '🌐';
    log(`💰 AsterDx: ${asterBid.toFixed(2)}/${asterAsk.toFixed(2)} (${asterMidPrice.toFixed(2)}) ${sourceIcon} | Backpack: ${backpackBid.toFixed(2)}/${backpackAsk.toFixed(2)} (${backpackMidPrice.toFixed(2)}) ${backpackIcon} | 价差: ${priceDiff.toFixed(2)}`);

    const group = stats.currentGroup;

    // 5. 交易逻辑
    if (!group.direction) {
      // 无持仓，寻找开仓机会
      if (Math.abs(priceDiff) > ARB_THRESHOLD) {
        if (priceDiff > 0) {
          // Backpack价格高: Backpack开空 + AsterDex开多
          await executeAddPosition('buy_aster_sell_backpack', {
            asterPrice: asterAsk,
            backpackPrice: backpackPrice,
            spread: priceDiff
          });
        } else {
          // AsterDex价格高: AsterDex开空 + Backpack开多
          await executeAddPosition('sell_aster_buy_backpack', {
            asterPrice: asterBid,
            backpackPrice: backpackPrice,
            spread: Math.abs(priceDiff)
          });
        }
      }
    } else {
      // 有持仓，检查加仓或平仓
      const currentSpread = Math.abs(priceDiff); // 当前价差绝对值
      const holdTime = Date.now() - group.firstOpenTime;

      log(`📊 持仓状态: ${group.direction} | 总量: ${group.totalAmount.toFixed(6)} | 仓位数: ${group.positions.length}/${MAX_ADD_POSITIONS} | 当前价差: ${currentSpread.toFixed(2)}`);

      // 平仓条件 - 价差小于25U
      if (currentSpread <= CLOSE_DIFF) {
        await closeAllPositions();
      }
      // 加仓条件
      else if (group.positions.length < MAX_ADD_POSITIONS && group.totalAmount < MAX_POSITION_SIZE) {
        const EPS = 0.1; // 容差值，允许0.1U的误差
        const requiredSpread = ARB_THRESHOLD + (group.positions.length * ADD_POSITION_SPREAD);

        // 检查价差方向是否和持仓方向一致
        const spreadDirection = priceDiff > 0 ? 'buy_aster_sell_backpack' : 'sell_aster_buy_backpack';

        if (spreadDirection === group.direction && currentSpread >= requiredSpread - EPS) {
          const prices = spreadDirection === 'buy_aster_sell_backpack'
            ? { asterPrice: asterAsk, backpackPrice: backpackPrice, spread: currentSpread }
            : { asterPrice: asterBid, backpackPrice: backpackPrice, spread: currentSpread };
          await executeAddPosition(group.direction, prices);
        }
      }
    }

  } catch (error) {
    log(`获取价格失败: ${error}`, 'error');
  } finally {
    isTrading = false; // 释放交易锁
  }
}

// AsterDex下单函数 - 使用CCXT binance适配器 (币安API格式)
async function placeAsterOrder(side: "BUY" | "SELL", amount: number, price?: number, reduceOnly = false, timestamp?: number) {
  try {
    // 构建订单参数
    const params: any = {};
    if (reduceOnly) {
      params.reduceOnly = true;
    }

    // 🔧 修复：正确调用AsterAPI的createMarketOrder方法
    // AsterAPI期望的side参数是 'buy' | 'sell' (小写)，内部会自动转大写
    const apiSide = side.toLowerCase() as 'buy' | 'sell';

    // 直接调用AsterAPI的createMarketOrder方法，传入统一时间戳
    const order = await asterPrivate.createMarketOrder(
      TRADE_SYMBOL,
      apiSide,
      amount,
      price, // price可以传undefined，AsterAPI会处理
      params,
      timestamp // 传入统一时间戳
    );

    log(`[AsterDex] ${side} ${amount} @ ${price || 'Market'} | 订单ID: ${order?.id}`, 'success');
    return order;
  } catch (error) {
    // 增强错误日志，显示更多细节
    log(`[AsterDx] 下单失败: ${error}`, 'error');
    if (error.response?.data) {
      log(`[AsterDx] 错误详情: ${JSON.stringify(error.response.data)}`, 'error');
    }
    return null;
  }
}

// 执行加仓
async function executeAddPosition(type, prices) {
  // 🚀 极致速度优化：移除时间锁，允许快速连续交易
  // await waitForTradeLock();  // 已禁用

  const group = stats.currentGroup;

  // 🔥 WebSocket余额检查：阻止余额不足的交易
  const now = Date.now();
  const asterBalance = stats.wsBalances.aster;
  const backpackBalance = stats.wsBalances.backpack;

  // 检查余额数据是否新鲜（30秒内更新）
  const asterBalanceFresh = (now - asterBalance.updateTime) < 30000;
  const backpackBalanceFresh = (now - backpackBalance.updateTime) < 30000;

  if (asterBalanceFresh && backpackBalanceFresh) {
    // 计算所需保证金（假设5倍杠杆，BTC价格约为60000）
    const requiredMargin = TRADE_AMOUNT * prices.asterPrice / LEVERAGE;
    const minBalance = 100; // 最小保留余额

    if (asterBalance.available < requiredMargin + minBalance) {
      log(`🚫 AsterDx余额不足，阻止交易！可用: ${asterBalance.available.toFixed(2)} USDT | 需要: ${(requiredMargin + minBalance).toFixed(2)} USDT`, 'error');
      return;
    }

    if (backpackBalance.available < requiredMargin + minBalance) {
      log(`🚫 Backpack余额不足，阻止交易！可用: ${backpackBalance.available.toFixed(2)} USDC | 需要: ${(requiredMargin + minBalance).toFixed(2)} USDC`, 'error');
      return;
    }

    log(`✅ 余额检查通过 | AsterDx: ${asterBalance.available.toFixed(2)} USDT | Backpack: ${backpackBalance.available.toFixed(2)} USDC`, 'info');
  } else {
    log(`⚠️ WebSocket余额数据过期，跳过余额检查 (AsterDx: ${asterBalanceFresh ? '✅' : '❌'}, Backpack: ${backpackBalanceFresh ? '✅' : '❌'})`, 'warn');
  }

  if (!group.direction) {
    group.direction = type;
    group.firstOpenTime = Date.now();
    log(`🎯 初次开仓 [${type}] | 价差: ${prices.spread.toFixed(2)} USDT`, 'success');
  } else {
    log(`📈 执行加仓 [${type}] | 价差: ${prices.spread.toFixed(2)} USDT | 第${group.positions.length + 1}仓`, 'success');
  }

  try {
    // 🔥 并发执行：同时下单到两个交易所，避免时间差导致的单边风险
    const asterSide = type === 'buy_aster_sell_backpack' ? 'BUY' : 'SELL';
    // 🔧 修复：Backpack CCXT需要的是 'buy' 或 'sell'，不是 'Ask' 或 'Bid'
    const backpackSide = type === 'buy_aster_sell_backpack' ? 'sell' : 'buy'; // 对冲交易：AsterDx买入时Backpack卖出，反之亦然
    const backpackSymbol = getBackpackSymbol(TRADE_SYMBOL);

    // ⏱️ 生成统一时间戳，确保两边订单时间一致
    const orderTimestamp = Date.now();
    const startTime = Date.now();

    log(`⚡ 并发下单 (统一时间戳: ${orderTimestamp}): [AsterDex] ${asterSide} ${TRADE_AMOUNT} | [Backpack] ${backpackSide} ${TRADE_AMOUNT}`, 'info');

    // 使用Promise.allSettled同时执行两个交易所的下单，带超时控制
    const TIMEOUT = 1500; // 🚀 极致速度优化：1.5秒超时（从3秒改为1.5秒）

    const [asterResult, backpackResult] = await Promise.allSettled([
      Promise.race([
        placeAsterOrder(asterSide, TRADE_AMOUNT, undefined, false, orderTimestamp),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AsterDx下单超时')), TIMEOUT))
      ]),
      Promise.race([
        backpackPrivate.createMarketOrder(
          backpackSymbol,
          backpackSide,
          TRADE_AMOUNT
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Backpack下单超时')), TIMEOUT))
      ])
    ]);

    const elapsed = Date.now() - startTime;
    log(`⏱️ 下单完成，总耗时: ${elapsed}ms`, 'info');

    // 解析执行结果
    const asterSuccess = asterResult.status === 'fulfilled' && asterResult.value?.id;
    const backpackSuccess = backpackResult.status === 'fulfilled' && backpackResult.value?.id;

    // 输出执行结果
    if (asterSuccess) {
      log(`✅ [AsterDex] ${asterSide}成功 | 订单ID: ${asterResult.value.id}`, 'success');
    } else {
      log(`❌ [AsterDex] ${asterSide}失败: ${asterResult.reason || '未知错误'}`, 'error');
    }

    if (backpackSuccess) {
      log(`✅ [Backpack] ${backpackSide}成功 | 订单ID: ${backpackResult.value.id}`, 'success');
    } else {
      log(`❌ [Backpack] ${backpackSide}失败: ${backpackResult.reason || '未知错误'}`, 'error');
    }

    // 只有两边都成功才记录仓位
    if (asterSuccess && backpackSuccess) {
      // 记录仓位 (保存正确的side信息用于后续平仓)
      const position = {
        asterSide: type === 'buy_aster_sell_backpack' ? 'BUY' : 'SELL',
        backpackSide: type === 'buy_aster_sell_backpack' ? 'sell' : 'buy', // 🔧 修复：保存实际的CCXT side
        amount: TRADE_AMOUNT,
        asterPrice: prices.asterPrice,
        backpackPrice: prices.backpackPrice,
        timestamp: Date.now(),
        spread: prices.spread,
      };

      group.positions.push(position);
      stats.positions.push(position);
      group.totalAmount += TRADE_AMOUNT;

      stats.dailyTrades++;
      stats.dailyVolume += TRADE_AMOUNT * prices.asterPrice * 2;

      log(`✅ 加仓成功 | 第${group.positions.length}仓 | 累计: ${group.totalAmount.toFixed(6)} | 今日交易量: ${stats.dailyVolume.toFixed(2)} USDT`, 'success');
    } else {
      log(`❌ 对冲失败，开始清理单边订单`, 'error');

      // 🔧 单边清理逻辑：并发执行后可能出现单边成功的情况
      if (asterSuccess && !backpackSuccess) {
        log(`🚨 检测到AsterDx单边持仓，立即清理...`, 'warn');
        const reverseSide = type === 'buy_aster_sell_backpack' ? 'SELL' : 'BUY';

        // 重试3次清理单边持仓
        let cleanupSuccess = false;
        for (let i = 0; i < 3; i++) {
          try {
            const cleanupOrder = await placeAsterOrder(reverseSide, TRADE_AMOUNT, undefined, true);
            if (cleanupOrder?.id) {
              cleanupSuccess = true;
              log(`✅ AsterDx单边清理成功，订单ID: ${cleanupOrder.id}`, 'success');
              break;
            }
          } catch (error) {
            log(`❌ 第${i + 1}次清理失败: ${error}`, 'error');
            if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
          }
        }

        if (!cleanupSuccess) {
          log(`💀 AsterDx单边清理失败，需要人工干预！`, 'error');
        }
      }

      // Backpack单边清理
      if (!asterSuccess && backpackSuccess) {
        log(`🚨 检测到Backpack单边持仓，立即清理...`, 'warn');
        const backpackCloseSide = type === 'buy_aster_sell_backpack' ? 'buy' : 'sell';

        // 重试3次清理单边持仓
        let cleanupSuccess = false;
        for (let i = 0; i < 3; i++) {
          try {
            const cleanupOrder = await backpackPrivate.createMarketOrder(
              getBackpackSymbol(TRADE_SYMBOL),
              backpackCloseSide,
              TRADE_AMOUNT,
              undefined,
              undefined,
              { reduceOnly: true }
            );
            if (cleanupOrder?.id) {
              cleanupSuccess = true;
              log(`✅ Backpack单边清理成功，订单ID: ${cleanupOrder.id}`, 'success');
              break;
            }
          } catch (error) {
            log(`❌ 第${i + 1}次清理失败: ${error}`, 'error');
            if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
          }
        }

        if (!cleanupSuccess) {
          log(`💀 Backpack单边清理失败，需要人工干预！`, 'error');
        }
      }
    }

  } catch (error) {
    log(`加仓失败: ${error}`, 'error');
  }
}

// 平仓所有持仓
async function closeAllPositions() {
  // 🚀 极致速度优化：移除时间锁，允许快速平仓
  // await waitForTradeLock();  // 已禁用

  const group = stats.currentGroup;
  if (!group.direction) return;

  const holdTime = Date.now() - group.firstOpenTime;
  log(`🔄 开始平仓 | 方向: ${group.direction} | 总持仓: ${group.totalAmount.toFixed(6)} | 持仓时间: ${(holdTime/60000).toFixed(1)}分钟`, 'warn');

  try {
    const positionsToClose = [...group.positions]; // 复制数组避免修改影响循环
    let closedCount = 0;

    for (let i = 0; i < positionsToClose.length; i++) {
      const position = positionsToClose[i];

      // 🚀 极致速度优化：移除等待，直接平仓
      if (i > 0) { // 第一个仓位不等待，后续仓位等待
        // await waitForTradeLock();  // 已禁用

        // 重新获取最新价差 (使用WebSocket价格)
        try {
          const asterPrice = await getAsterPrice();
          const backpackTicker = await backpackPrivate.fetchTicker(getBackpackSymbol(TRADE_SYMBOL));

          const asterAsk = asterPrice.ask;
          const asterBid = asterPrice.bid;
          const backpackPrice = backpackTicker.price;
          const currentPriceDiff = backpackPrice - (asterAsk + asterBid) / 2;
          const currentSpread = Math.abs(currentPriceDiff);

          log(`🔍 重新检查价差 | 当前价差: ${currentSpread.toFixed(2)} USDT | 平仓阈值: ${CLOSE_DIFF} USDT`, 'info');

          // 如果价差重新变大，停止继续平仓
          if (currentSpread > CLOSE_DIFF + 5) { // 加5U缓冲避免频繁触发
            log(`⚠️ 价差重新变大(${currentSpread.toFixed(2)} > ${CLOSE_DIFF + 5})，停止继续平仓 | 已平仓: ${closedCount}/${positionsToClose.length}`, 'warn');
            break;
          }
        } catch (error) {
          log(`❌ 重新检查价差失败: ${error} | 继续平仓`, 'error');
        }
      }

      log(`🔄 平仓第${i+1}/${positionsToClose.length}个仓位 | 数量: ${position.amount}`, 'info');

      // ⚡ 并发平仓：同时平仓两个交易所，避免时间差风险
      const asterCloseSide = position.asterSide === 'BUY' ? 'SELL' : 'BUY';
      // 🔧 修复：平仓时做反向操作
      const backpackCloseSide = position.backpackSide === 'sell' ? 'buy' : 'sell'; // 反向操作：之前卖出现在买入，之前买入现在卖出

      // ⏱️ 生成统一时间戳，确保两边订单时间一致
      const closeTimestamp = Date.now();
      const startTime = Date.now();

      log(`⚡ 并发平仓 (统一时间戳: ${closeTimestamp}): [AsterDx] ${asterCloseSide} ${position.amount} | [Backpack] ${backpackCloseSide} ${position.amount}`, 'info');

      // 并发执行两个交易所的平仓，带超时控制
      const TIMEOUT = 1500; // 🚀 极致速度优化：1.5秒超时（从3秒改为1.5秒）

      const [asterCloseResult, backpackCloseResult] = await Promise.allSettled([
        Promise.race([
          placeAsterOrder(asterCloseSide, position.amount, undefined, true, closeTimestamp),
          new Promise((_, reject) => setTimeout(() => reject(new Error('AsterDx平仓超时')), TIMEOUT))
        ]),
        Promise.race([
          backpackPrivate.createMarketOrder(
            getBackpackSymbol(TRADE_SYMBOL),
            backpackCloseSide,
            position.amount,
            undefined,
            undefined,
            { reduceOnly: true }
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Backpack平仓超时')), TIMEOUT))
        ])
      ]);

      const elapsed = Date.now() - startTime;
      log(`⏱️ 平仓完成，总耗时: ${elapsed}ms`, 'info');

      // 检查平仓结果
      const asterCloseSuccess = asterCloseResult.status === 'fulfilled' && asterCloseResult.value?.id;
      const backpackCloseSuccess = backpackCloseResult.status === 'fulfilled' && backpackCloseResult.value?.id;

      if (asterCloseSuccess && backpackCloseSuccess) {
        log(`✅ 第${i+1}个仓位平仓成功 | AsterDx: ${asterCloseResult.value.id} | Backpack: ${backpackCloseResult.value.id}`, 'success');
        closedCount++;
      } else {
        // 部分平仓失败，需要处理剩余单边 - 实现真正的重试逻辑
        if (asterCloseSuccess && !backpackCloseSuccess) {
          log(`⚠️ Backpack平仓失败，AsterDx已平仓 | 错误: ${backpackCloseResult.reason}`, 'error');

          // 🔧 实现真正的Backpack重试逻辑
          let retrySuccess = false;
          for (let retry = 0; retry < 3; retry++) {
            await new Promise(resolve => setTimeout(resolve, 2000));  // 等待2秒
            log(`🔄 第${retry + 1}次重试Backpack平仓...`, 'warn');

            try {
              const newTimestamp = Date.now();  // 使用新时间戳
              const retryOrder = await backpackPrivate.createMarketOrder(
                getBackpackSymbol(TRADE_SYMBOL),
                backpackCloseSide,
                position.amount,
                undefined,
                undefined,
                { reduceOnly: true }
              );

              if (retryOrder?.id) {
                log(`✅ Backpack重试平仓成功 | 订单ID: ${retryOrder.id}`, 'success');
                retrySuccess = true;
                closedCount++;
                break;
              }
            } catch (error) {
              log(`❌ 第${retry + 1}次Backpack重试失败: ${error}`, 'error');
            }
          }

          if (!retrySuccess) {
            log(`💀 Backpack平仓重试3次均失败，需要人工处理！`, 'error');
          }

        } else if (!asterCloseSuccess && backpackCloseSuccess) {
          log(`⚠️ AsterDx平仓失败，Backpack已平仓 | 错误: ${asterCloseResult.reason}`, 'error');

          // 🔧 实现真正的AsterDx重试逻辑
          let retrySuccess = false;
          for (let retry = 0; retry < 3; retry++) {
            await new Promise(resolve => setTimeout(resolve, 2000));  // 等待2秒
            log(`🔄 第${retry + 1}次重试AsterDx平仓...`, 'warn');

            try {
              const newTimestamp = Date.now();  // 使用新时间戳
              const retryOrder = await placeAsterOrder(asterCloseSide, position.amount, undefined, true, newTimestamp);

              if (retryOrder?.id) {
                log(`✅ AsterDx重试平仓成功 | 订单ID: ${retryOrder.id}`, 'success');
                retrySuccess = true;
                closedCount++;
                break;
              }
            } catch (error) {
              log(`❌ 第${retry + 1}次AsterDx重试失败: ${error}`, 'error');
            }
          }

          if (!retrySuccess) {
            log(`💀 AsterDx平仓重试3次均失败，需要人工处理！`, 'error');
          }

        } else {
          log(`❌ 两边平仓都失败 | AsterDx: ${asterCloseResult.reason} | Backpack: ${backpackCloseResult.reason}`, 'error');
        }
      }
    }

    log(`📊 平仓汇总: ${closedCount}/${positionsToClose.length} 个仓位已平仓`, 'info');

    // 清空持仓 - 只清空已平仓的部分
    if (closedCount === positionsToClose.length) {
      // 全部平仓完成
      stats.positions = [];
      stats.currentGroup = {
        direction: null,
        totalAmount: 0,
        positions: [],
        firstOpenTime: 0,
      };
      log(`🎉 全部平仓完成 | 本轮交易结束`, 'success');
    } else {
      // 部分平仓，更新剩余仓位
      const remainingPositions = group.positions.slice(closedCount);
      stats.positions = remainingPositions;
      stats.currentGroup.positions = remainingPositions;
      stats.currentGroup.totalAmount = remainingPositions.reduce((sum, pos) => sum + pos.amount, 0);
      log(`⚠️ 部分平仓完成 | 剩余仓位: ${remainingPositions.length}个 | 剩余数量: ${stats.currentGroup.totalAmount.toFixed(6)}`, 'warn');
    }

  } catch (error) {
    log(`平仓失败: ${error}`, 'error');
  }
}

// 统计报告
function printStats() {
  const volumeProgress = (stats.dailyVolume / DAILY_VOLUME_TARGET * 100).toFixed(1);
  const tradesProgress = (stats.dailyTrades / DAILY_TRADES_TARGET * 100).toFixed(1);

  console.log('\n=== 📊 今日交易统计 ===');
  console.log(`交易量: ${stats.dailyVolume.toFixed(2)} / ${DAILY_VOLUME_TARGET} USDT (${volumeProgress}%)`);
  console.log(`交易笔数: ${stats.dailyTrades} / ${DAILY_TRADES_TARGET} (${tradesProgress}%)`);
  console.log(`当前持仓: ${stats.positions.length}`);
  console.log(`盈亏: ${stats.dailyProfit.toFixed(2)} USDT`);
  console.log('========================\n');
}

// 主程序
async function main() {
  log('🚀 启动 AsterDex <-> Backpack 真实5x杠杆对冲交易机器人', 'success');
  log(`目标: ${DAILY_VOLUME_TARGET} USDT交易量, ${DAILY_TRADES_TARGET}笔交易`, 'info');
  log(`交易符号: ${TRADE_SYMBOL} (${TRADE_AMOUNT}) → ${getBackpackSymbol(TRADE_SYMBOL)}`, 'info');

  // 初始化双WebSocket价格管理器
  log('🚀 初始化双WebSocket价格管理器...', 'info');
  await priceManager.initializeAll();

  // 显示连接状态 - 🚀 减少日志频率，降低IO开销
  setInterval(() => {
    log(priceManager.getPriceStats(), 'info');
  }, 30000); // 从10秒改为30秒

  // 等待1秒让WebSocket连接建立 - 🚀 极致速度优化：减少启动等待时间
  await new Promise(resolve => setTimeout(resolve, 1000)); // 从3秒改为1秒

  // 🔥 WebSocket优化1：激活AsterDx订单实时推送
  const asterSDK = priceManager.getAsterSDK();

  asterSDK.watchOrder((orders) => {
    orders.forEach(order => {
      const status = order.status === 'FILLED' ? '✅ 成交' :
                     order.status === 'NEW' ? '📝 新订单' :
                     order.status === 'CANCELED' ? '❌ 已取消' : order.status;
      log(`📋 [AsterDx订单] ${status} | ID: ${order.orderId} | ${order.side} ${order.origQty} @ ${order.price || 'Market'}`, 'info');

      // 🔥 缓存订单数据（保留最近10个订单）
      stats.wsOrders.aster.unshift({
        id: order.orderId,
        status: order.status,
        side: order.side,
        quantity: parseFloat(order.origQty),
        price: order.price ? parseFloat(order.price) : null,
        timestamp: Date.now()
      });
      if (stats.wsOrders.aster.length > 10) {
        stats.wsOrders.aster = stats.wsOrders.aster.slice(0, 10);
      }
    });
  });

  // 🔥 WebSocket优化2+3：激活AsterDx持仓和余额实时推送
  asterSDK.watchAccount((accountData) => {
    // 持仓推送 + 缓存
    const btcPosition = accountData.positions.find((p: any) => p.symbol === 'BTCUSDT');
    if (btcPosition) {
      const positionAmt = parseFloat(btcPosition.positionAmt || 0);

      // 🔥 缓存持仓数据
      stats.wsPositions.aster = {
        amount: Math.abs(positionAmt),
        side: positionAmt > 0 ? 'long' : positionAmt < 0 ? 'short' : null,
        unrealizedPnl: parseFloat(btcPosition.unrealizedProfit || 0),
        updateTime: Date.now()
      };

      if (positionAmt !== 0) {
        log(`📊 [AsterDx持仓] ${positionAmt > 0 ? '多头' : '空头'} ${Math.abs(positionAmt)} BTC | 未实现盈亏: ${parseFloat(btcPosition.unrealizedProfit || 0).toFixed(2)} USDT`, 'info');
      }
    }

    // 余额推送 + 缓存
    const usdtBalance = accountData.assets.find((a: any) => a.asset === 'USDT');
    if (usdtBalance) {
      const availableBalance = parseFloat(usdtBalance.availableBalance || 0);

      // 🔥 缓存余额数据
      stats.wsBalances.aster = {
        available: availableBalance,
        total: parseFloat(usdtBalance.balance || 0),
        updateTime: Date.now()
      };

      log(`💰 [AsterDx余额] 可用: ${availableBalance.toFixed(2)} USDT | 总计: ${parseFloat(usdtBalance.balance || 0).toFixed(2)} USDT`, 'info');

      // 余额预警
      if (availableBalance < 100) {
        log(`⚠️ AsterDx余额不足100 USDT！当前: ${availableBalance.toFixed(2)} USDT`, 'warn');
      }
    }
  });

  log('✅ AsterDx WebSocket实时推送已激活：订单、持仓、余额', 'success');

  // 🔥 新增功能1：订阅标记价格和资金费率（风险管理）
  asterSDK.watchMarkPrice('BTCUSDT', (markData: any) => {
    stats.markPrice = {
      price: parseFloat(markData.markPrice || 0),
      indexPrice: parseFloat(markData.indexPrice || 0),
      fundingRate: parseFloat(markData.fundingRate || 0),
      nextFundingTime: markData.nextFundingTime || 0,
      updateTime: Date.now()
    };

    // 资金费率预警（超过1%）
    if (Math.abs(stats.markPrice.fundingRate) > 0.01) {
      log(`⚠️ 高资金费率警告: ${(stats.markPrice.fundingRate * 100).toFixed(3)}%`, 'warn');
    }

    // 标记价格与现货价格偏差检查
    const asterPrice = priceManager.getAsterPrice();
    if (asterPrice && asterPrice.lastPrice > 0) {
      const priceDiff = Math.abs(stats.markPrice.price - asterPrice.lastPrice);
      if (priceDiff > 100) {
        log(`⚠️ 标记价格偏差过大: ${priceDiff.toFixed(2)} USD | 标记价: ${stats.markPrice.price.toFixed(2)} | 现货价: ${asterPrice.lastPrice.toFixed(2)}`, 'warn');
      }
    }

    // 每5分钟打印一次资金费率信息
    if (Date.now() % 300000 < 5000) {
      const nextFundingDate = new Date(stats.markPrice.nextFundingTime).toLocaleTimeString();
      log(`📊 资金费率: ${(stats.markPrice.fundingRate * 100).toFixed(4)}% | 下次结算: ${nextFundingDate}`, 'info');
    }
  });

  // 🔥 新增功能2：订阅聚合交易流（市场情绪分析）
  asterSDK.watchAggTrade('BTCUSDT', (trade: any) => {
    // 添加到最近交易列表
    stats.recentTrades.push({
      price: parseFloat(trade.price),
      quantity: parseFloat(trade.quantity),
      time: trade.tradeTime,
      isBuyerMaker: trade.isBuyerMaker
    });

    // 保留最近100笔交易
    if (stats.recentTrades.length > 100) {
      stats.recentTrades.shift();
    }

    // 检测大单（超过0.5 BTC）
    if (parseFloat(trade.quantity) > 0.5) {
      const direction = trade.isBuyerMaker ? '卖单' : '买单';
      log(`🐋 大单检测: ${direction} ${trade.quantity} BTC @ ${parseFloat(trade.price).toFixed(1)}`, 'warn');
    }

    // 每10秒计算一次市场情绪
    const now = Date.now();
    if (now - stats.marketSentiment.lastUpdate > 10000 && stats.recentTrades.length >= 20) {
      const buyVolume = stats.recentTrades.filter(t => !t.isBuyerMaker).reduce((sum, t) => sum + t.quantity, 0);
      const sellVolume = stats.recentTrades.filter(t => t.isBuyerMaker).reduce((sum, t) => sum + t.quantity, 0);
      const totalVolume = buyVolume + sellVolume;

      if (totalVolume > 0) {
        stats.marketSentiment.buyPressure = buyVolume / totalVolume;
        stats.marketSentiment.lastUpdate = now;

        if (stats.marketSentiment.buyPressure > 0.7) {
          log(`📈 市场情绪: 买盘压力较大 ${(stats.marketSentiment.buyPressure * 100).toFixed(1)}%`, 'info');
        } else if (stats.marketSentiment.buyPressure < 0.3) {
          log(`📉 市场情绪: 卖盘压力较大 ${((1 - stats.marketSentiment.buyPressure) * 100).toFixed(1)}%`, 'info');
        }
      }
    }
  });

  log('✅ AsterDx高级功能已激活：标记价格、资金费率、市场情绪分析', 'success');

  // 🔥 WebSocket优化4：激活Backpack订单、持仓、余额实时推送
  await priceManager.initBackpackPrivateStream(
    // 订单回调 + 缓存
    (order) => {
      const status = order.status === 'Filled' ? '✅ 成交' :
                     order.status === 'New' ? '📝 新订单' :
                     order.status === 'Cancelled' ? '❌ 已取消' : order.status;
      log(`📋 [Backpack订单] ${status} | ID: ${order.id} | ${order.side} ${order.quantity} @ ${order.price || 'Market'}`, 'info');

      // 🔥 缓存订单数据（保留最近10个订单）
      stats.wsOrders.backpack.unshift({
        id: order.id,
        status: order.status,
        side: order.side,
        quantity: parseFloat(order.quantity),
        price: order.price ? parseFloat(order.price) : null,
        timestamp: Date.now()
      });
      if (stats.wsOrders.backpack.length > 10) {
        stats.wsOrders.backpack = stats.wsOrders.backpack.slice(0, 10);
      }
    },
    // 持仓回调 + 缓存
    (position) => {
      if (position.symbol === 'BTC_USDC') {
        const positionAmt = parseFloat(position.quantity || 0);

        // 🔥 缓存持仓数据
        stats.wsPositions.backpack = {
          amount: Math.abs(positionAmt),
          side: positionAmt > 0 ? 'long' : positionAmt < 0 ? 'short' : null,
          unrealizedPnl: parseFloat(position.unrealizedPnl || 0),
          updateTime: Date.now()
        };

        if (positionAmt !== 0) {
          log(`📊 [Backpack持仓] ${positionAmt > 0 ? '多头' : '空头'} ${Math.abs(positionAmt)} BTC | 未实现盈亏: ${parseFloat(position.unrealizedPnl || 0).toFixed(2)} USDT`, 'info');
        }
      }
    },
    // 余额回调 + 缓存
    (balance) => {
      if (balance.asset === 'USDC') {
        const availableBalance = parseFloat(balance.available || 0);

        // 🔥 缓存余额数据
        stats.wsBalances.backpack = {
          available: availableBalance,
          total: parseFloat(balance.total || 0),
          updateTime: Date.now()
        };

        log(`💰 [Backpack余额] 可用: ${availableBalance.toFixed(2)} USDC | 总计: ${parseFloat(balance.total || 0).toFixed(2)} USDC`, 'info');

        // 余额预警
        if (availableBalance < 100) {
          log(`⚠️ Backpack余额不足100 USDC！当前: ${availableBalance.toFixed(2)} USDC`, 'warn');
        }
      }
    }
  );

  log('✅ Backpack WebSocket推送已激活：订单、持仓、余额', 'success');

  // 主循环 - 🚀 极致速度优化：每1秒检查一次（从3秒改为1秒）
  setInterval(async () => {
    await checkPricesAndTrade();
  }, 1000);

  // 🔥 实时WebSocket持仓一致性检查（每5秒检查一次，使用WebSocket缓存数据）
  setInterval(() => {
    try {
      const now = Date.now();
      const asterPos = stats.wsPositions.aster;
      const backpackPos = stats.wsPositions.backpack;

      // 检查WebSocket数据是否新鲜（30秒内更新）
      const asterDataFresh = (now - asterPos.updateTime) < 30000;
      const backpackDataFresh = (now - backpackPos.updateTime) < 30000;

      if (!asterDataFresh || !backpackDataFresh) {
        log(`⚠️ WebSocket持仓数据过期，跳过检查 (AsterDx: ${asterDataFresh ? '✅' : '❌'}, Backpack: ${backpackDataFresh ? '✅' : '❌'})`, 'warn');
        return;
      }

      // 使用WebSocket实时数据检查持仓一致性
      const asterAmount = asterPos.amount || 0;
      const backpackAmount = backpackPos.amount || 0;

      if (Math.abs(asterAmount - backpackAmount) > 0.001) {
        log(`🚨 持仓不一致！AsterDx: ${asterAmount.toFixed(4)} BTC (${asterPos.side || '无'}) | Backpack: ${backpackAmount.toFixed(4)} BTC (${backpackPos.side || '无'})`, 'error');
        log(`🚨 检测到单边持仓风险！`, 'error');

        // 可选：自动停止交易
        // isTrading = true; // 锁定交易，不再开新仓
      } else if (asterAmount > 0 || backpackAmount > 0) {
        log(`✅ 持仓一致: 双边各持有 ${asterAmount.toFixed(4)} BTC | 盈亏: AsterDx ${asterPos.unrealizedPnl.toFixed(2)} USDT, Backpack ${backpackPos.unrealizedPnl.toFixed(2)} USDT`, 'success');
      }
    } catch (error) {
      log(`⚠️ WebSocket持仓检查失败: ${error}`, 'warn');
    }
  }, 5000); // 🚀 每5秒检查一次（从5分钟改为5秒，300x更快）

  // 📊 REST API备份检查（每30分钟，作为WebSocket的备份验证）
  setInterval(async () => {
    try {
      log('🔍 执行REST API备份持仓检查...', 'info');

      const asterPositions = await asterPrivate.fetchPositions();
      const backpackPositions = await backpackPrivate.fetchPositions();

      const asterBTCPosition = asterPositions.find((pos: any) => pos.symbol === 'BTCUSDT');
      const backpackBTCPosition = backpackPositions.find((pos: any) => pos.symbol === 'BTC/USDC:USDC');

      const asterAmount = asterBTCPosition ? Math.abs(asterBTCPosition.contracts || 0) : 0;
      const backpackAmount = backpackBTCPosition ? Math.abs(backpackBTCPosition.contracts || 0) : 0;

      log(`📊 REST API验证: AsterDx ${asterAmount.toFixed(4)} BTC | Backpack ${backpackAmount.toFixed(4)} BTC`, 'info');

      // 与WebSocket数据对比
      const wsAsterAmount = stats.wsPositions.aster.amount || 0;
      const wsBackpackAmount = stats.wsPositions.backpack.amount || 0;

      if (Math.abs(asterAmount - wsAsterAmount) > 0.001 || Math.abs(backpackAmount - wsBackpackAmount) > 0.001) {
        log(`⚠️ WebSocket与REST API数据不一致！WS: ${wsAsterAmount.toFixed(4)}/${wsBackpackAmount.toFixed(4)} | REST: ${asterAmount.toFixed(4)}/${backpackAmount.toFixed(4)}`, 'warn');
      }
    } catch (error) {
      log(`⚠️ REST API备份检查失败: ${error}`, 'warn');
    }
  }, 30 * 60 * 1000); // 30分钟检查一次

  // 统计报告 - 🚀 减少统计频率，降低CPU占用
  setInterval(printStats, 60000); // 从30秒改为60秒

  log('✅ 机器人已启动，正在监听真实价格差价...', 'success');
}

// 优雅退出
process.on('SIGINT', async () => {
  log('正在关闭机器人...', 'warn');

  // 关闭双WebSocket连接
  try {
    priceManager.cleanup();
    log('🔌 双WebSocket连接已关闭', 'info');
  } catch (error) {
    log(`❌ 关闭WebSocket连接失败: ${error}`, 'error');
  }

  await closeAllPositions();
  printStats();
  process.exit(0);
});

main().catch(error => {
  log(`启动失败: ${error}`, 'error');
  process.exit(1);
});