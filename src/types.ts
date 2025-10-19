/**
 * 类型定义
 */

export type Exchange = 'edgex' | 'paradex';
export type OrderSide = 'buy' | 'sell';

export interface TradeResult {
  success: boolean;
  orderId?: string;
  fillData?: EdgeXFillData | ParadexFillData;
  error?: string;
}

export interface EdgeXFillData {
  id: string;
  orderId: string;
  fillPrice: number;
  fillSize: number;
  fillValue: number;
  fillFee: number;
  realizePnl: number;
  direction: string;
  createdTime: number;
}

export interface ParadexFillData {
  id: string;
  order_id: string;
  price: number;
  size: number;
  fee: number;
  realized_pnl: number;
  realized_funding: number;
  liquidity: string;
  created_at: number;
}
