/**
 * 多档加权价差计算系统
 * 用于套利交易机器人的高级价差分析和开仓决策
 *
 * 核心功能:
 * 1. 多档加权成交价计算 - 模拟实际大单成交
 * 2. 可执行价差计算 - 考虑双向开仓和平仓价差
 * 3. EMA平滑 - 减少价差抖动
 * 4. 智能开仓决策 - 多重保护机制
 */

// ==================== 类型定义 ====================

/**
 * 订单簿数据结构
 * bids/asks: [[price, size], [price, size], ...]
 */
export interface OrderBook {
  bids: [number, number][];  // 买单 [[价格, 数量], ...]
  asks: [number, number][];  // 卖单 [[价格, 数量], ...]
}

/**
 * 可执行价差数据
 */
export interface ExecutableSpreads {
  openSpreadA: number;        // 买A卖B价差 (buy Exchange A, sell Exchange B)
  openSpreadB: number;        // 卖A买B价差 (sell Exchange A, buy Exchange B)
  unwindSpreadA: number;      // A方向平仓价差
  unwindSpreadB: number;      // B方向平仓价差
  exchangeASpread: number;    // 交易所A点差
  exchangeBSpread: number;    // 交易所B点差
  symmetryCheck: number;      // 对称性检查 abs(A+B)
}

/**
 * EMA状态
 */
export interface EMAState {
  openA: number | null;       // 方向A的EMA
  openB: number | null;       // 方向B的EMA
}

/**
 * 开仓决策参数
 */
export interface OpenParams {
  minNetOpen: number;         // 最小净开仓价差 (默认: 25)
  hysteresis: number;         // 滞后量/缓冲区 (默认: 7)
  maxVenueSpread: number;     // 单交易所最大点差 (默认: 15)
  maxAsymmetry: number;       // 最大不对称性 (默认: 20)
  minUnwindLimit: number;     // 即刻回转最小值 (默认: -15)
}

/**
 * 开仓上下文
 */
export interface OpenContext {
  lastTradeTime: number;      // 上次交易时间戳
  cooldownPeriod: number;     // 冷静期 (毫秒, 默认: 10000)
}

/**
 * 开仓决策结果
 */
export interface OpenDecision {
  direction: 'buy_a_sell_b' | 'sell_a_buy_b' | null;
  spread: number;             // 选中的价差
  emaState: EMAState;         // 更新后的EMA状态
  reason: string;             // 决策原因
  debug?: {                   // 调试信息
    scoreA: number;
    scoreB: number;
    unwindA: number;
    unwindB: number;
    symmetry: number;
  };
}

// ==================== 核心函数 ====================

/**
 * 计算按目标成交量的加权平均成交价
 *
 * 算法逻辑:
 * - 对于买入(吃ask): 从asks[0]开始累加，直到满足size
 * - 对于卖出(吃bid): 从bids[0]开始累加，直到满足size
 * - 如果深度不足，返回NaN
 *
 * @param side 'buy' 买入(吃ask) | 'sell' 卖出(吃bid)
 * @param size 目标成交量(BTC)
 * @param orderbook 订单簿 { bids: [[price, size]], asks: [[price, size]] }
 * @returns 加权平均价，深度不足返回NaN
 *
 * @example
 * const orderbook = {
 *   bids: [[99000, 0.5], [98990, 1.0]],
 *   asks: [[99010, 0.3], [99020, 0.8]]
 * };
 * const buyPrice = calculateFillPrice('buy', 0.5, orderbook);
 * // 结果: (99010 * 0.3 + 99020 * 0.2) / 0.5 = 99014
 */
export function calculateFillPrice(
  side: 'buy' | 'sell',
  size: number,
  orderbook: OrderBook
): number {
  // 参数验证
  if (size <= 0) {
    console.warn(`[calculateFillPrice] 无效的交易量: ${size}`);
    return NaN;
  }

  if (!orderbook || !orderbook.bids || !orderbook.asks) {
    console.warn(`[calculateFillPrice] 订单簿数据无效`);
    return NaN;
  }

  // 选择正确的订单簿侧
  const levels = side === 'buy' ? orderbook.asks : orderbook.bids;

  if (!levels || levels.length === 0) {
    console.warn(`[calculateFillPrice] ${side} 侧订单簿为空`);
    return NaN;
  }

  // 多档加权计算
  let remainingSize = size;
  let totalCost = 0;
  let filledSize = 0;

  for (const [price, levelSize] of levels) {
    if (remainingSize <= 0) break;

    // 当前档位可以提供的数量
    const availableSize = Math.min(levelSize, remainingSize);

    // 累加成本和已成交数量
    totalCost += price * availableSize;
    filledSize += availableSize;
    remainingSize -= availableSize;
  }

  // 检查是否满足目标成交量
  if (remainingSize > 1e-8) {  // 允许微小的浮点误差
    console.warn(
      `[calculateFillPrice] 深度不足: 需要 ${size}, 只能成交 ${filledSize} (${side})`
    );
    return NaN;
  }

  // 返回加权平均价
  return totalCost / filledSize;
}

/**
 * 计算双向可执行开仓价差
 *
 * 价差定义:
 * - openSpreadA = 买A卖B价差 = exchangeB卖价 - exchangeA买价
 * - openSpreadB = 卖A买B价差 = exchangeA卖价 - exchangeB买价
 * - unwindSpreadA = A方向平仓价差 = exchangeA卖价 - exchangeB买价 (与openSpreadB相同)
 * - unwindSpreadB = B方向平仓价差 = exchangeB卖价 - exchangeA买价 (与openSpreadA相同)
 *
 * 保护机制:
 * - 点差检查: 单交易所点差过大说明流动性差
 * - 对称性检查: |openSpreadA + openSpreadB| 应该接近0
 *
 * @param size 交易量(BTC)
 * @param exchangeABook 交易所A订单簿
 * @param exchangeBBook 交易所B订单簿
 * @returns ExecutableSpreads对象，包含各种价差数据
 *
 * @example
 * const spreads = computeExecutableSpreads(0.01, exchangeABook, exchangeBBook);
 * console.log(`买A卖B价差: ${spreads.openSpreadA}, 对称性: ${spreads.symmetryCheck}`);
 */
export function computeExecutableSpreads(
  size: number,
  exchangeABook: OrderBook,
  exchangeBBook: OrderBook
): ExecutableSpreads {
  // 计算四个方向的加权成交价
  const aBuyPrice = calculateFillPrice('buy', size, exchangeABook);   // 在A买入的价格(吃ask)
  const aSellPrice = calculateFillPrice('sell', size, exchangeABook); // 在A卖出的价格(吃bid)
  const bBuyPrice = calculateFillPrice('buy', size, exchangeBBook);   // 在B买入的价格(吃ask)
  const bSellPrice = calculateFillPrice('sell', size, exchangeBBook); // 在B卖出的价格(吃bid)

  // 如果任何一个价格无效，返回全NaN
  if (
    isNaN(aBuyPrice) ||
    isNaN(aSellPrice) ||
    isNaN(bBuyPrice) ||
    isNaN(bSellPrice)
  ) {
    console.warn(`[computeExecutableSpreads] 部分价格无效，返回NaN价差`);
    return {
      openSpreadA: NaN,
      openSpreadB: NaN,
      unwindSpreadA: NaN,
      unwindSpreadB: NaN,
      exchangeASpread: NaN,
      exchangeBSpread: NaN,
      symmetryCheck: NaN
    };
  }

  // 计算开仓价差
  // 方向A: 买A, 卖B
  const openSpreadA = bSellPrice - aBuyPrice;

  // 方向B: 卖A, 买B
  const openSpreadB = aSellPrice - bBuyPrice;

  // 计算平仓价差 (与开仓相反方向)
  // A方向平仓: 卖A, 买B = openSpreadB
  const unwindSpreadA = openSpreadB;

  // B方向平仓: 买A, 卖B = openSpreadA
  const unwindSpreadB = openSpreadA;

  // 计算单交易所点差
  const exchangeASpread = aBuyPrice - aSellPrice;
  const exchangeBSpread = bBuyPrice - bSellPrice;

  // 对称性检查: openSpreadA + openSpreadB 应该接近 0
  // 因为: (B卖 - A买) + (A卖 - B买) = (B卖 - B买) + (A卖 - A买) = 点差之和
  const symmetryCheck = Math.abs(openSpreadA + openSpreadB);

  return {
    openSpreadA,
    openSpreadB,
    unwindSpreadA,
    unwindSpreadB,
    exchangeASpread,
    exchangeBSpread,
    symmetryCheck
  };
}

/**
 * 指数移动平均 (EMA)
 *
 * 公式: EMA_new = alpha * current + (1 - alpha) * EMA_prev
 *
 * 平滑系数选择:
 * - alpha = 0.35 对应约1.2秒半衰期 (假设300ms更新间隔)
 * - 半衰期计算: t_half = ln(0.5) / ln(1 - alpha) * 更新间隔
 *
 * @param prev 上次EMA值 (null表示首次计算)
 * @param current 当前值
 * @param alpha 平滑系数 (默认: 0.35)
 * @returns 新的EMA值
 *
 * @example
 * let emaValue = null;
 * emaValue = ema(null, 25.5, 0.35);      // 首次: 返回25.5
 * emaValue = ema(emaValue, 27.3, 0.35);  // 更新: 返回26.13
 */
export function ema(
  prev: number | null,
  current: number,
  alpha: number = 0.35
): number {
  // 参数验证
  if (alpha < 0 || alpha > 1) {
    console.warn(`[ema] alpha应在[0,1]范围内, 当前值: ${alpha}, 使用默认值0.35`);
    alpha = 0.35;
  }

  // 首次计算，直接返回当前值
  if (prev === null || isNaN(prev)) {
    return current;
  }

  // 如果当前值无效，保持上次EMA
  if (isNaN(current)) {
    return prev;
  }

  // EMA计算
  return alpha * current + (1 - alpha) * prev;
}

/**
 * 判断是否应该开仓及方向
 *
 * 决策流程:
 * 1. 冷静期检查 - 避免频繁交易
 * 2. 数据有效性检查 - 确保所有价差数据有效
 * 3. 单交易所点差检查 - 流动性保护
 * 4. 对称性检查 - 数据一致性验证
 * 5. EMA更新 - 平滑价差数据
 * 6. 双向打分 - 综合评估两个方向
 * 7. 选优开仓 - 选择得分高的方向
 *
 * 打分规则:
 * - 基础分: EMA价差
 * - 滞后奖励: 超过阈值+hysteresis的部分
 * - 平仓惩罚: 如果即刻回转价差过低
 *
 * @param spreads 价差数据
 * @param emaState EMA状态 { openA: number|null, openB: number|null }
 * @param params 参数配置
 * @param context 上下文信息
 * @returns OpenDecision 开仓决策结果
 *
 * @example
 * const decision = shouldOpen(spreads, emaState, {
 *   minNetOpen: 25,
 *   hysteresis: 7,
 *   maxVenueSpread: 15,
 *   maxAsymmetry: 20,
 *   minUnwindLimit: -15
 * }, {
 *   lastTradeTime: Date.now() - 15000,
 *   cooldownPeriod: 10000
 * });
 *
 * if (decision.direction) {
 *   console.log(`开仓方向: ${decision.direction}, 价差: ${decision.spread}`);
 * }
 */
export function shouldOpen(
  spreads: ExecutableSpreads,
  emaState: EMAState,
  params: OpenParams,
  context: OpenContext
): OpenDecision {
  // 默认参数
  const {
    minNetOpen = 25,
    hysteresis = 7,
    maxVenueSpread = 15,
    maxAsymmetry = 20,
    minUnwindLimit = -15
  } = params;

  const {
    lastTradeTime = 0,
    cooldownPeriod = 10000
  } = context;

  // 1. 冷静期检查
  const timeSinceLastTrade = Date.now() - lastTradeTime;
  if (timeSinceLastTrade < cooldownPeriod) {
    return {
      direction: null,
      spread: 0,
      emaState,
      reason: `冷静期: 距上次交易 ${(timeSinceLastTrade / 1000).toFixed(1)}s < ${(cooldownPeriod / 1000).toFixed(1)}s`
    };
  }

  // 2. 数据有效性检查
  if (
    isNaN(spreads.openSpreadA) ||
    isNaN(spreads.openSpreadB) ||
    isNaN(spreads.unwindSpreadA) ||
    isNaN(spreads.unwindSpreadB)
  ) {
    return {
      direction: null,
      spread: 0,
      emaState,
      reason: '价差数据无效 (深度不足)'
    };
  }

  // 3. 单交易所点差检查 - 流动性保护
  if (spreads.exchangeASpread > maxVenueSpread) {
    return {
      direction: null,
      spread: 0,
      emaState,
      reason: `交易所A点差过大: ${spreads.exchangeASpread.toFixed(2)} > ${maxVenueSpread}`
    };
  }

  if (spreads.exchangeBSpread > maxVenueSpread) {
    return {
      direction: null,
      spread: 0,
      emaState,
      reason: `交易所B点差过大: ${spreads.exchangeBSpread.toFixed(2)} > ${maxVenueSpread}`
    };
  }

  // 4. 对称性检查 - 数据一致性验证
  if (spreads.symmetryCheck > maxAsymmetry) {
    return {
      direction: null,
      spread: 0,
      emaState,
      reason: `不对称性过高: ${spreads.symmetryCheck.toFixed(2)} > ${maxAsymmetry}`
    };
  }

  // 5. EMA更新 - 使用0.35平滑系数 (约1.2秒半衰期)
  const newEMAState: EMAState = {
    openA: ema(emaState.openA, spreads.openSpreadA, 0.35),
    openB: ema(emaState.openB, spreads.openSpreadB, 0.35)
  };

  // 6. 双向打分
  const emaA = newEMAState.openA!;
  const emaB = newEMAState.openB!;
  const unwindA = spreads.unwindSpreadA;
  const unwindB = spreads.unwindSpreadB;

  // 打分逻辑:
  // - 基础分 = EMA价差
  // - 滞后奖励 = max(0, EMA - (minNetOpen + hysteresis))
  // - 平仓惩罚 = 如果unwind < minUnwindLimit, 则扣分

  let scoreA = emaA;
  let scoreB = emaB;

  // 滞后奖励 - 超过阈值越多得分越高
  const thresholdWithHysteresis = minNetOpen + hysteresis;
  if (emaA > thresholdWithHysteresis) {
    scoreA += (emaA - thresholdWithHysteresis) * 0.5;  // 50%的额外加权
  }
  if (emaB > thresholdWithHysteresis) {
    scoreB += (emaB - thresholdWithHysteresis) * 0.5;
  }

  // 平仓惩罚 - 即刻回转不能太差
  if (unwindA < minUnwindLimit) {
    scoreA -= (minUnwindLimit - unwindA) * 2;  // 2倍惩罚
  }
  if (unwindB < minUnwindLimit) {
    scoreB -= (minUnwindLimit - unwindB) * 2;
  }

  // 7. 选优开仓
  const debugInfo = {
    scoreA,
    scoreB,
    unwindA,
    unwindB,
    symmetry: spreads.symmetryCheck
  };

  // 检查是否满足最小开仓阈值
  if (scoreA < minNetOpen && scoreB < minNetOpen) {
    return {
      direction: null,
      spread: 0,
      emaState: newEMAState,
      reason: `双向得分均不足: A=${scoreA.toFixed(2)} B=${scoreB.toFixed(2)} < ${minNetOpen}`,
      debug: debugInfo
    };
  }

  // 选择得分更高的方向
  if (scoreA > scoreB && scoreA >= minNetOpen) {
    return {
      direction: 'buy_a_sell_b',
      spread: spreads.openSpreadA,
      emaState: newEMAState,
      reason: `方向A得分最高: ${scoreA.toFixed(2)} (EMA=${emaA.toFixed(2)}, Unwind=${unwindA.toFixed(2)})`,
      debug: debugInfo
    };
  } else if (scoreB >= minNetOpen) {
    return {
      direction: 'sell_a_buy_b',
      spread: spreads.openSpreadB,
      emaState: newEMAState,
      reason: `方向B得分最高: ${scoreB.toFixed(2)} (EMA=${emaB.toFixed(2)}, Unwind=${unwindB.toFixed(2)})`,
      debug: debugInfo
    };
  }

  // 兜底 - 不应该到达这里
  return {
    direction: null,
    spread: 0,
    emaState: newEMAState,
    reason: '未知原因: 未选择任何方向',
    debug: debugInfo
  };
}

// ==================== 辅助工具函数 ====================

/**
 * 格式化价差数据为可读字符串
 * 用于日志输出和调试
 */
export function formatSpreads(spreads: ExecutableSpreads): string {
  return [
    `开仓A: ${spreads.openSpreadA.toFixed(2)}`,
    `开仓B: ${spreads.openSpreadB.toFixed(2)}`,
    `平仓A: ${spreads.unwindSpreadA.toFixed(2)}`,
    `平仓B: ${spreads.unwindSpreadB.toFixed(2)}`,
    `点差[A/B]: ${spreads.exchangeASpread.toFixed(2)}/${spreads.exchangeBSpread.toFixed(2)}`,
    `对称性: ${spreads.symmetryCheck.toFixed(2)}`
  ].join(' | ');
}

/**
 * 创建默认开仓参数
 */
export function createDefaultParams(): OpenParams {
  return {
    minNetOpen: 25,
    hysteresis: 7,
    maxVenueSpread: 15,
    maxAsymmetry: 20,
    minUnwindLimit: -15
  };
}

/**
 * 创建默认EMA状态
 */
export function createDefaultEMAState(): EMAState {
  return {
    openA: null,
    openB: null
  };
}

/**
 * 验证订单簿数据格式
 * 返回true表示格式有效
 */
export function validateOrderBook(book: any): book is OrderBook {
  if (!book || typeof book !== 'object') return false;
  if (!Array.isArray(book.bids) || !Array.isArray(book.asks)) return false;

  // 检查至少有一档数据
  if (book.bids.length === 0 || book.asks.length === 0) return false;

  // 检查第一档数据格式
  const firstBid = book.bids[0];
  const firstAsk = book.asks[0];

  if (!Array.isArray(firstBid) || firstBid.length < 2) return false;
  if (!Array.isArray(firstAsk) || firstAsk.length < 2) return false;

  // 检查价格和数量是否为数字
  if (typeof firstBid[0] !== 'number' || typeof firstBid[1] !== 'number') return false;
  if (typeof firstAsk[0] !== 'number' || typeof firstAsk[1] !== 'number') return false;

  return true;
}

// ==================== 导出所有功能 ====================

export default {
  calculateFillPrice,
  computeExecutableSpreads,
  ema,
  shouldOpen,
  formatSpreads,
  createDefaultParams,
  createDefaultEMAState,
  validateOrderBook
};
