import EdgexAPI from './edgex-api.js';
import Paradex from './exchanges/paradex.js';
import { EdgeXPythonClient } from './edgex-python-wrapper.js';

/**
 * EdgeX ↔ Paradex 价差套利机器人
 *
 * 策略：
 * 1. 价差 >= 100U → 开仓（EdgeX买 + Paradex卖）
 * 2. 价差 <= 50U → 平仓（EdgeX卖 + Paradex买）
 * 3. 利润 = 开仓价差 - 平仓价差 - 手续费
 */
class EdgexParadexSpreadBot {
  // EdgeX
  private edgexAPI: EdgexAPI;
  private edgexPython: EdgeXPythonClient;
  private edgexBid = 0;
  private edgexAsk = 0;

  // Paradex
  private paradexAPI: Paradex;
  private paradexBid = 0;
  private paradexAsk = 0;

  // 策略配置
  private readonly OPEN_THRESHOLD = 100;  // 开仓价差阈值
  private readonly CLOSE_THRESHOLD = 50;  // 平仓价差阈值
  private readonly TRADE_SIZE = 0.01;     // 每次交易0.01 BTC

  // 持仓状态
  private hasPosition = false;
  private entrySpread = 0;
  private edgexOrderFilled = false;
  private paradexOrderFilled = false;

  constructor() {
    // 初始化EdgeX
    this.edgexAPI = new EdgexAPI({
      starkPrivateKey: process.env.EDGEX_STARK_PRIVATE_KEY!,
      accountId: process.env.EDGEX_ACCOUNT_ID
    });
    this.edgexPython = new EdgeXPythonClient();

    // 初始化Paradex
    this.paradexAPI = new Paradex();
  }

  /**
   * 启动机器人
   */
  async start() {
    console.log('🤖 EdgeX-Paradex 价差套利机器人启动');
    console.log(`📊 开仓阈值: ${this.OPEN_THRESHOLD}U`);
    console.log(`📊 平仓阈值: ${this.CLOSE_THRESHOLD}U`);
    console.log(`💰 交易大小: ${this.TRADE_SIZE} BTC`);
    console.log('='.repeat(60));

    // 1. 连接EdgeX深度WebSocket
    await this.connectEdgeXDepth();

    // 2. 连接Paradex深度WebSocket
    await this.connectParadexDepth();

    // 3. 连接EdgeX私有WebSocket
    await this.connectEdgeXPrivate();

    // 4. 连接Paradex私有WebSocket
    await this.connectParadexPrivate();

    console.log('✅ 所有WebSocket连接成功，开始监控价差...\n');
  }

  /**
   * 连接EdgeX深度WebSocket
   */
  private async connectEdgeXDepth() {
    // 先连接WebSocket
    await this.edgexAPI.connectWebSocket();

    // 等待连接成功后订阅深度
    setTimeout(() => {
      this.edgexAPI.subscribeDepth('10000001', (depth) => {
        // EdgeX depth格式: { bids: [{price, size}], asks: [{price, size}] }
        if (depth.bids && depth.bids.length > 0) {
          this.edgexBid = parseFloat(depth.bids[0].price);
        }
        if (depth.asks && depth.asks.length > 0) {
          this.edgexAsk = parseFloat(depth.asks[0].price);
        }

        this.checkSpread();
      });
    }, 1000);

    console.log('✅ EdgeX深度WebSocket已连接');
  }

  /**
   * 连接Paradex深度WebSocket
   */
  private async connectParadexDepth() {
    this.paradexAPI.watchOrderBook('BTC-USD-PERP', (orderbook: any) => {
      this.paradexBid = parseFloat(orderbook.bids[0]?.[0] || 0);
      this.paradexAsk = parseFloat(orderbook.asks[0]?.[0] || 0);
      this.checkSpread();
    });

    console.log('✅ Paradex深度WebSocket已连接');
  }

  /**
   * 连接EdgeX私有WebSocket
   */
  private async connectEdgeXPrivate() {
    await this.edgexAPI.connectPrivateWebSocket({
      onOrder: (order: any) => {
        if (order.status === 'FILLED') {
          console.log(`✅ EdgeX订单成交: ${order.side} ${order.filledSize} @ ${order.avgPrice}`);
          this.edgexOrderFilled = true;
          this.checkBothFilled();
        }
      },
      onPosition: (positions: any) => {
        console.log('EdgeX持仓更新:', positions);
      }
    });

    console.log('✅ EdgeX私有WebSocket已连接');
  }

  /**
   * 连接Paradex私有WebSocket
   */
  private async connectParadexPrivate() {
    this.paradexAPI.watchOrders('BTC-USD-PERP', (orders: any[]) => {
      const filled = orders.find(o => o.status === 'closed' || o.status === 'filled');
      if (filled && !this.paradexOrderFilled) {
        console.log(`✅ Paradex订单成交: ${filled.side} ${filled.filled_qty} @ ${filled.avg_price}`);
        this.paradexOrderFilled = true;
        this.checkBothFilled();
      }
    });

    console.log('✅ Paradex私有WebSocket已连接');
  }

  /**
   * 检查价差并执行交易
   */
  private checkSpread() {
    if (!this.edgexBid || !this.paradexBid) return;

    // 计算中间价
    const edgexMid = (this.edgexBid + this.edgexAsk) / 2;
    const paradexMid = (this.paradexBid + this.paradexAsk) / 2;

    // 计算价差（EdgeX - Paradex）
    const spread = edgexMid - paradexMid;

    // 实时显示价差
    console.log(`📊 价差: ${spread.toFixed(2)}U | EdgeX=${edgexMid.toFixed(1)} | Paradex=${paradexMid.toFixed(1)} | 持仓=${this.hasPosition ? '是' : '否'}`);

    // 开仓逻辑
    if (!this.hasPosition && spread >= this.OPEN_THRESHOLD) {
      console.log(`\n🚀 价差${spread.toFixed(2)}U >= ${this.OPEN_THRESHOLD}U，触发开仓！`);
      this.openPosition(spread);
    }

    // 平仓逻辑
    if (this.hasPosition && spread <= this.CLOSE_THRESHOLD) {
      const profit = this.entrySpread - spread;
      console.log(`\n💰 价差${spread.toFixed(2)}U <= ${this.CLOSE_THRESHOLD}U，触发平仓！`);
      console.log(`   入场价差: ${this.entrySpread.toFixed(2)}U`);
      console.log(`   当前价差: ${spread.toFixed(2)}U`);
      console.log(`   理论利润: ${profit.toFixed(2)}U`);
      this.closePosition();
    }
  }

  /**
   * 开仓
   */
  private async openPosition(spread: number) {
    try {
      this.entrySpread = spread;
      this.edgexOrderFilled = false;
      this.paradexOrderFilled = false;

      console.log(`\n📈 开仓执行:`);
      console.log(`   EdgeX: 买入 ${this.TRADE_SIZE} BTC @ ${this.edgexAsk}`);
      console.log(`   Paradex: 卖出 ${this.TRADE_SIZE} BTC @ ${this.paradexBid}`);

      // 同时在两边下单
      await Promise.all([
        this.edgexAPI.createMarketOrder('10000001', 'BUY', this.TRADE_SIZE),
        this.paradexAPI.createOrder({
          market: 'BTC-USD-PERP',
          side: 'SELL',
          type: 'MARKET',
          size: this.TRADE_SIZE.toString()
        })
      ]);

      console.log('✅ 开仓订单已提交，等待成交确认...');
    } catch (error) {
      console.error('❌ 开仓失败:', error);
    }
  }

  /**
   * 平仓
   */
  private async closePosition() {
    try {
      this.edgexOrderFilled = false;
      this.paradexOrderFilled = false;

      console.log(`\n📉 平仓执行:`);
      console.log(`   EdgeX: 卖出 ${this.TRADE_SIZE} BTC @ ${this.edgexBid}`);
      console.log(`   Paradex: 买入 ${this.TRADE_SIZE} BTC @ ${this.paradexAsk}`);

      // 反向平仓
      await Promise.all([
        this.edgexAPI.createMarketOrder('10000001', 'SELL', this.TRADE_SIZE),
        this.paradexAPI.createOrder({
          market: 'BTC-USD-PERP',
          side: 'BUY',
          type: 'MARKET',
          size: this.TRADE_SIZE.toString()
        })
      ]);

      console.log('✅ 平仓订单已提交，等待成交确认...');
    } catch (error) {
      console.error('❌ 平仓失败:', error);
    }
  }

  /**
   * 检查双边是否都成交
   */
  private checkBothFilled() {
    if (this.edgexOrderFilled && this.paradexOrderFilled) {
      if (!this.hasPosition) {
        // 开仓完成
        this.hasPosition = true;
        console.log(`\n✅✅ 开仓成功！入场价差: ${this.entrySpread.toFixed(2)}U\n`);
      } else {
        // 平仓完成
        this.hasPosition = false;
        console.log(`\n✅✅ 平仓成功！本次交易完成\n`);
        console.log('='.repeat(60) + '\n');
      }
    }
  }
}

// 启动机器人
const bot = new EdgexParadexSpreadBot();
bot.start().catch(console.error);
