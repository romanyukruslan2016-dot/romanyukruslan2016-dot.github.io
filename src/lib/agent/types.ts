import type { ColumnId } from '../../types';
import type { MenuItem } from '../menu';

export type { MenuItem };

export interface CreateOrderItemInput {
  dishName: string;
  modifiers: string[];
  quantity: number;
}

export interface CreateOrderInput {
  tableNumber: number;
  items: CreateOrderItemInput[];
}

export type CreateOrderFailureReason = 'unknown_dish' | 'unknown_modifier' | 'invalid_table' | 'empty_order';

export type CreateOrderResult =
  | { ok: true; orderNumber: number; estimatedMinutes: number }
  | { ok: false; reason: CreateOrderFailureReason; detail?: string };

export type OrderStatusResult =
  | { ok: true; status: ColumnId; minutesElapsed: number }
  | { ok: false; reason: 'not_found' };
