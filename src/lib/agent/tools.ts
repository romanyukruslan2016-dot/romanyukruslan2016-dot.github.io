// The three tools the ordering agent is allowed to call. Every write goes
// through demoEngine's shared createOrderFromAgent — the same audit-trailed
// path ScenarioPanel's buttons use — so there is no parallel write path into
// `orders`. There is intentionally no tool for changing prices, cancelling
// someone else's order, or handling payment: the capability doesn't exist,
// it's not just withheld by the prompt.

import { createOrderFromAgent, getOrderByNumber, ESTIMATED_PREP_MINUTES } from '../demoEngine';
import { findMenuItem, isKnownModifier, MENU_ITEMS } from '../menu';
import type { Dish } from '../../types';
import type { CreateOrderInput, CreateOrderResult, MenuItem, OrderStatusResult } from './types';

const MIN_TABLE_NUMBER = 1;
const MAX_TABLE_NUMBER = 50;

function isValidTableNumber(tableNumber: number): boolean {
  return Number.isInteger(tableNumber) && tableNumber >= MIN_TABLE_NUMBER && tableNumber <= MAX_TABLE_NUMBER;
}

export function getMenu(): MenuItem[] {
  return MENU_ITEMS;
}

export function createOrder(input: CreateOrderInput): CreateOrderResult {
  if (!isValidTableNumber(input.tableNumber)) {
    return { ok: false, reason: 'invalid_table', detail: `${input.tableNumber}` };
  }
  if (input.items.length === 0) {
    return { ok: false, reason: 'empty_order' };
  }

  const dishes: Dish[] = [];
  for (const item of input.items) {
    const menuItem = findMenuItem(item.dishName);
    if (!menuItem) {
      return { ok: false, reason: 'unknown_dish', detail: item.dishName };
    }
    for (const modifier of item.modifiers) {
      if (!isKnownModifier(menuItem, modifier)) {
        return { ok: false, reason: 'unknown_modifier', detail: `${modifier} (${menuItem.name})` };
      }
    }
    const quantity = Math.max(1, Math.floor(item.quantity) || 1);
    for (let i = 0; i < quantity; i++) {
      dishes.push({ name: menuItem.name, modifiers: [...item.modifiers] });
    }
  }

  const order = createOrderFromAgent({ tableNumber: input.tableNumber, dishes });
  return { ok: true, orderNumber: order.orderNumber, estimatedMinutes: ESTIMATED_PREP_MINUTES };
}

export function getOrderStatus(orderNumber: number): OrderStatusResult {
  const order = getOrderByNumber(orderNumber);
  if (!order) return { ok: false, reason: 'not_found' };

  const minutesElapsed = Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000));
  return { ok: true, status: order.column, minutesElapsed };
}
