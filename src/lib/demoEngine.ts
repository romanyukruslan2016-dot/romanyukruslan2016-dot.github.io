import { useSyncExternalStore } from 'react';
import type { ColumnId, Dish, EngineEvent, EngineSnapshot, Order, TableCounts } from '../types';

const MENU: { name: string; modifiers: string[] }[] = [
  { name: 'Борщ', modifiers: ['Без сметани', 'Гострий', 'Подвійна порція'] },
  { name: 'Вареники', modifiers: ['З картоплею', 'З сиром', "З м'ясом", 'Смажені'] },
  { name: 'Стейк', modifiers: ['Medium rare', 'Well done', 'Без солі', 'З перцевим соусом'] },
  { name: 'Салат Цезар', modifiers: ['Без грінок', 'Без анчоусів', 'З куркою'] },
  { name: 'Піца Маргарита', modifiers: ['Тонке тісто', 'Без цибулі', 'Подвійний сир'] },
  { name: 'Курка гриль', modifiers: ['Гостра', 'З лимоном', 'Без шкірки'] },
  { name: 'Деруни', modifiers: ['Зі сметаною', 'З грибним соусом'] },
  { name: 'Шашлик', modifiers: ['Гострий маринад', 'Без цибулі', 'Подвійна порція'] },
];

const KITCHEN_STATIONS_COUNT = 5;
const AUTOPLAY_INTERVAL_MS = 30_000;
const CLOCK_TICK_MS = 5_000;
const NEW_TO_PREP_MS = 2 * 60_000;
const PREP_TO_READY_MS = 3 * 60_000;
const MAX_EVENTS = 10;

let orders: Order[] = [];
let events: EngineEvent[] = [];
let autoplay = false;
let orderCounter = 3000;
let eventCounter = 0;

const counters = {
  orders: 0,
  order_items: 0,
  order_modifiers: 0,
  order_status_history: 0,
};

let autoplayIntervalId: number | null = null;
let clockIntervalId: number | null = null;

const listeners = new Set<() => void>();

let snapshot: EngineSnapshot = buildSnapshot();

function buildSnapshot(): EngineSnapshot {
  const tableCounts: TableCounts = {
    orders: counters.orders,
    order_items: counters.order_items,
    order_modifiers: counters.order_modifiers,
    kitchen_stations: KITCHEN_STATIONS_COUNT,
    order_status_history: counters.order_status_history,
  };
  return { orders: [...orders], events: [...events], tableCounts, autoplay };
}

function notify() {
  snapshot = buildSnapshot();
  listeners.forEach((fn) => fn());
}

function pushEvent(text: string) {
  const time = new Date().toLocaleTimeString('uk-UA', { hour12: false });
  events = [{ id: `evt-${++eventCounter}`, time, text }, ...events].slice(0, MAX_EVENTS);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickDishes(): Dish[] {
  const count = 1 + Math.floor(Math.random() * 3);
  const pool = shuffle(MENU).slice(0, count);
  return pool.map((item) => {
    const modCount = 1 + Math.floor(Math.random() * Math.min(2, item.modifiers.length));
    return { name: item.name, modifiers: shuffle(item.modifiers).slice(0, modCount) };
  });
}

function sortByCreatedAt(list: Order[]): Order[] {
  return [...list].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function earliestInColumn(column: ColumnId): Order | undefined {
  return sortByCreatedAt(orders.filter((o) => o.column === column))[0];
}

export function insertMockOrder() {
  const dishes = pickDishes();
  const order: Order = {
    id: `order-${++orderCounter}`,
    orderNumber: orderCounter,
    tableNumber: 1 + Math.floor(Math.random() * 20),
    dishes,
    column: 'new',
    createdAt: new Date().toISOString(),
  };
  orders = [...orders, order];

  counters.orders += 1;
  counters.order_items += dishes.length;
  counters.order_modifiers += dishes.reduce((sum, d) => sum + d.modifiers.length, 0);
  counters.order_status_history += 1;

  pushEvent(`Order #${order.orderNumber} created → new`);
  notify();
}

export function advanceNewToPrep() {
  const order = earliestInColumn('new');
  if (!order) {
    pushEvent('No new orders to advance → new→prep');
    notify();
    return;
  }
  orders = orders.map((o) =>
    o.id === order.id ? { ...o, column: 'prep', prepStartedAt: new Date().toISOString() } : o,
  );
  counters.order_status_history += 1;
  pushEvent(`Order #${order.orderNumber} moved to prep → new→prep`);
  notify();
}

export function advancePrepToReady() {
  const order = earliestInColumn('prep');
  if (!order) {
    pushEvent('No prep orders to advance → prep→ready');
    notify();
    return;
  }
  orders = orders.map((o) =>
    o.id === order.id ? { ...o, column: 'ready', readyStartedAt: new Date().toISOString() } : o,
  );
  counters.order_status_history += 1;
  pushEvent(`Order #${order.orderNumber} moved to ready → prep→ready`);
  notify();
}

export function serveReadyOrder() {
  const order = earliestInColumn('ready');
  if (!order) {
    pushEvent('No ready orders to serve → ready→done');
    notify();
    return;
  }
  orders = orders.filter((o) => o.id !== order.id);
  counters.order_status_history += 1;
  pushEvent(`Order #${order.orderNumber} served → ready→done`);
  notify();
}

export function cancelNewOrder() {
  const order = earliestInColumn('new');
  if (!order) {
    pushEvent('No new orders to cancel → new→cancelled');
    notify();
    return;
  }
  orders = orders.filter((o) => o.id !== order.id);
  counters.order_status_history += 1;
  pushEvent(`Order #${order.orderNumber} cancelled → new→cancelled`);
  notify();
}

function checkAutoProgress() {
  const now = Date.now();
  let changed = false;

  orders = orders.map((o) => {
    if (o.column === 'new' && now - new Date(o.createdAt).getTime() >= NEW_TO_PREP_MS) {
      changed = true;
      counters.order_status_history += 1;
      pushEvent(`Order #${o.orderNumber} auto-moved to prep → new→prep`);
      return { ...o, column: 'prep' as ColumnId, prepStartedAt: new Date().toISOString() };
    }
    if (
      o.column === 'prep' &&
      o.prepStartedAt &&
      now - new Date(o.prepStartedAt).getTime() >= PREP_TO_READY_MS
    ) {
      changed = true;
      counters.order_status_history += 1;
      pushEvent(`Order #${o.orderNumber} auto-moved to ready → prep→ready`);
      return { ...o, column: 'ready' as ColumnId, readyStartedAt: new Date().toISOString() };
    }
    return o;
  });

  if (changed) notify();
}

export function runLogicStep() {
  pushEvent('Logic step executed → checked auto-progress timers');
  checkAutoProgress();
  notify();
}

export function toggleAutoplay() {
  if (autoplay) {
    if (autoplayIntervalId !== null) window.clearInterval(autoplayIntervalId);
    autoplayIntervalId = null;
    autoplay = false;
    pushEvent('Autoplay turned OFF');
  } else {
    autoplay = true;
    insertMockOrder();
    autoplayIntervalId = window.setInterval(insertMockOrder, AUTOPLAY_INTERVAL_MS);
    pushEvent('Autoplay turned ON');
  }
  notify();
}

function ensureClockStarted() {
  if (clockIntervalId !== null) return;
  clockIntervalId = window.setInterval(checkAutoProgress, CLOCK_TICK_MS);
}

function subscribe(onStoreChange: () => void): () => void {
  ensureClockStarted();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): EngineSnapshot {
  return snapshot;
}

export function useDemoEngine(): EngineSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}
