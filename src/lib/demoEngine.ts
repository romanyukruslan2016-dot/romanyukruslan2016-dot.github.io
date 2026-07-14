import { useSyncExternalStore } from 'react';
import { nextColumn } from '../types';
import type { ColumnId, Dish, EngineEvent, EngineSnapshot, Order, TableCounts } from '../types';
import type { ActorRole, CommandSource, IncidentRecord } from '../types/audit';
import {
  newCorrelationId,
  recordCommand,
  recordIncident,
  recordStateSnapshot,
  recordTechnicalTrace,
  resolveIncidentLocally,
  getIncidents,
} from './audit/auditTrail';
import {
  detectColumnMismatch,
  detectCrossSessionMismatch,
  detectDuplicateStatusChange,
  detectInvalidStatusTransition,
  detectMissingOrders,
  detectRealtimeLatency,
  detectStaleClientState,
  type SessionSnapshot,
  type StatusChangeEvent,
} from './audit/detectors';
import { buildPlaybookSteps } from './audit/playbooks';
import { MENU_ITEMS } from './menu';

const MENU: { name: string; modifiers: string[] }[] = MENU_ITEMS.map((item) => ({
  name: item.name,
  modifiers: item.availableModifiers,
}));

const KITCHEN_STATIONS_COUNT = 5;
const AUTOPLAY_INTERVAL_MS = 30_000;
const CLOCK_TICK_MS = 5_000;
const NEW_TO_PREP_MS = 2 * 60_000;
const PREP_TO_READY_MS = 3 * 60_000;
export const ESTIMATED_PREP_MINUTES = (NEW_TO_PREP_MS + PREP_TO_READY_MS) / 60_000;
const MAX_EVENTS = 10;
const REALTIME_LATENCY_THRESHOLD_MS = 2000;

// Identifies "this browser tab" as an observing session for state snapshots
// (used by the cross-session-mismatch detector/simulator).
const DEMO_SESSION_ID = crypto.randomUUID();

let orders: Order[] = [];
let events: EngineEvent[] = [];
let autoplay = false;
let orderCounter = 3000;
let eventCounter = 0;
let playbooks: Record<string, ReturnType<typeof buildPlaybookSteps>> = {};
let focusedIncidentId: string | null = null;
let autoIncidentRegistered = false;

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
  return {
    orders: [...orders],
    events: [...events],
    tableCounts,
    autoplay,
    incidents: [...getIncidents()],
    playbooks,
    focusedIncidentId,
  };
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

function pickRandomFrom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
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

// Records the standard command + state-snapshot + technical-trace triple for
// a real order action, carrying the same correlation_id through all three so
// the full path can be reconstructed via correlation_chain_view.
function logOrderAction(params: {
  correlationId: string;
  actionType: string;
  order: Order;
  actorRole: ActorRole;
  source: CommandSource;
  statusOverride?: string;
  payload?: Record<string, unknown>;
}): void {
  const now = new Date().toISOString();
  const status = params.statusOverride ?? params.order.column;

  recordCommand({
    correlationId: params.correlationId,
    actorRole: params.actorRole,
    actionType: params.actionType,
    targetOrderId: params.order.id,
    source: params.source,
    payload: params.payload ?? {},
  });
  recordStateSnapshot({
    correlationId: params.correlationId,
    orderId: params.order.id,
    snapshotSource: 'ui',
    sessionId: DEMO_SESSION_ID,
    status,
    stateVersion: now,
    statePayload: { column: status },
  });
  recordTechnicalTrace({
    correlationId: params.correlationId,
    layer: 'ui',
    functionName: params.actionType,
    eventTimestamp: now,
    receivedTimestamp: now,
    status: 'ok',
  });
}

// Shared write path for creating an order: every caller (the mock-order
// button, the ordering agent, future real intake channels) goes through
// here so there is exactly one place that assigns an order number, updates
// the simulated table counters, and writes the command/state-snapshot/trace
// audit triple. Do not insert into `orders` anywhere else.
function createOrderCore(params: {
  tableNumber: number;
  dishes: Dish[];
  actorRole: ActorRole;
  source: CommandSource;
}): Order {
  const order: Order = {
    id: crypto.randomUUID(),
    orderNumber: ++orderCounter,
    tableNumber: params.tableNumber,
    dishes: params.dishes,
    column: 'new',
    createdAt: new Date().toISOString(),
  };
  orders = [...orders, order];

  counters.orders += 1;
  counters.order_items += params.dishes.length;
  counters.order_modifiers += params.dishes.reduce((sum, d) => sum + d.modifiers.length, 0);
  counters.order_status_history += 1;

  logOrderAction({
    correlationId: newCorrelationId(),
    actionType: 'create_order',
    order,
    actorRole: params.actorRole,
    source: params.source,
    payload: { tableNumber: order.tableNumber, dishCount: params.dishes.length },
  });

  pushEvent(`Order #${order.orderNumber} created → new`);
  notify();
  return order;
}

export function insertMockOrder() {
  createOrderCore({
    tableNumber: 1 + Math.floor(Math.random() * 20),
    dishes: pickDishes(),
    actorRole: 'admin',
    source: 'ui',
  });
}

// Entry point for the ordering agent (src/lib/agent/tools.ts). Dish/modifier
// and table validation happen in the agent's createOrder tool before this is
// called — by the time we get here the input is trusted.
export function createOrderFromAgent(input: { tableNumber: number; dishes: Dish[] }): Order {
  return createOrderCore({
    tableNumber: input.tableNumber,
    dishes: input.dishes,
    actorRole: 'waiter',
    source: 'demo_engine',
  });
}

export function getOrderByNumber(orderNumber: number): Order | undefined {
  return orders.find((o) => o.orderNumber === orderNumber);
}

export function advanceNewToPrep() {
  const order = earliestInColumn('new');
  if (!order) {
    pushEvent('No new orders to advance → new→prep');
    notify();
    return;
  }
  const correlationId = newCorrelationId();
  const updated: Order = { ...order, column: 'prep', prepStartedAt: new Date().toISOString() };
  orders = orders.map((o) => (o.id === order.id ? updated : o));
  counters.order_status_history += 1;

  logOrderAction({ correlationId, actionType: 'advance_new_to_prep', order: updated, actorRole: 'admin', source: 'ui' });

  const transitionIncident = detectInvalidStatusTransition(order.column, updated.column, {
    orderId: order.id,
    correlationId,
  });
  if (transitionIncident) recordIncident(transitionIncident);

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
  const correlationId = newCorrelationId();
  const updated: Order = { ...order, column: 'ready', readyStartedAt: new Date().toISOString() };
  orders = orders.map((o) => (o.id === order.id ? updated : o));
  counters.order_status_history += 1;

  logOrderAction({ correlationId, actionType: 'advance_prep_to_ready', order: updated, actorRole: 'admin', source: 'ui' });

  const transitionIncident = detectInvalidStatusTransition(order.column, updated.column, {
    orderId: order.id,
    correlationId,
  });
  if (transitionIncident) recordIncident(transitionIncident);

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
  const correlationId = newCorrelationId();
  logOrderAction({
    correlationId,
    actionType: 'serve_order',
    order,
    actorRole: 'admin',
    source: 'ui',
    statusOverride: 'served',
  });

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
  const correlationId = newCorrelationId();
  logOrderAction({
    correlationId,
    actionType: 'cancel_order',
    order,
    actorRole: 'admin',
    source: 'ui',
    statusOverride: 'cancelled',
  });

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
      const correlationId = newCorrelationId();
      const updated: Order = { ...o, column: 'prep' as ColumnId, prepStartedAt: new Date().toISOString() };
      logOrderAction({ correlationId, actionType: 'auto_advance_new_to_prep', order: updated, actorRole: 'system', source: 'system_auto' });
      const transitionIncident = detectInvalidStatusTransition(o.column, updated.column, { orderId: o.id, correlationId });
      if (transitionIncident) recordIncident(transitionIncident);
      pushEvent(`Order #${o.orderNumber} auto-moved to prep → new→prep`);
      return updated;
    }
    if (
      o.column === 'prep' &&
      o.prepStartedAt &&
      now - new Date(o.prepStartedAt).getTime() >= PREP_TO_READY_MS
    ) {
      changed = true;
      counters.order_status_history += 1;
      const correlationId = newCorrelationId();
      const updated: Order = { ...o, column: 'ready' as ColumnId, readyStartedAt: new Date().toISOString() };
      logOrderAction({ correlationId, actionType: 'auto_advance_prep_to_ready', order: updated, actorRole: 'system', source: 'system_auto' });
      const transitionIncident = detectInvalidStatusTransition(o.column, updated.column, { orderId: o.id, correlationId });
      if (transitionIncident) recordIncident(transitionIncident);
      pushEvent(`Order #${o.orderNumber} auto-moved to ready → prep→ready`);
      return updated;
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

// ---------------------------------------------------------------------------
// Demo-mode fault simulators — one per critical scenario from the audit-layer
// spec. Each fabricates a realistic fault, feeds it through the matching
// detector, and (on success) registers an incident with a ready-to-run
// recovery playbook. Used both for the automatic first-open incident and by
// "Показати шлях виправлення" when no open incident already exists.
// ---------------------------------------------------------------------------

function simulateOrderDisappearedScenario(): IncidentRecord | null {
  const target = pickRandomFrom(orders);
  if (!target) return null;
  const correlationId = newCorrelationId();
  const dbOrderIds = orders.map((o) => o.id);

  recordStateSnapshot({
    correlationId,
    orderId: target.id,
    snapshotSource: 'db',
    status: target.column,
    stateVersion: new Date().toISOString(),
    statePayload: { column: target.column },
  });

  orders = orders.filter((o) => o.id !== target.id);

  recordStateSnapshot({
    correlationId,
    orderId: target.id,
    snapshotSource: 'ui',
    sessionId: DEMO_SESSION_ID,
    status: 'missing',
    stateVersion: new Date().toISOString(),
    statePayload: { column: null },
  });

  const uiOrderIds = orders.map((o) => o.id);
  const draft = detectMissingOrders(dbOrderIds, uiOrderIds).find((d) => d.orderId === target.id);
  if (!draft) return null;

  const incident = recordIncident({ ...draft, correlationIds: [correlationId] });
  playbooks = {
    ...playbooks,
    [incident.id]: buildPlaybookSteps(incident, {
      description: `Відновити замовлення #${target.orderNumber} з підтвердженого стану БД`,
      action: () => {
        orders = [...orders, target];
        pushEvent(`Order #${target.orderNumber} restored from DB truth → ${target.column}`);
        notify();
      },
    }),
  };
  pushEvent(`Order #${target.orderNumber} disappeared from board`);
  notify();
  return incident;
}

function simulateStatusSkippedScenario(): IncidentRecord | null {
  const target = orders.find((o) => o.column === 'new');
  if (!target) return null;
  const correlationId = newCorrelationId();
  const fromStatus = target.column;
  const updated: Order = { ...target, column: 'ready', readyStartedAt: new Date().toISOString() };
  orders = orders.map((o) => (o.id === target.id ? updated : o));

  logOrderAction({ correlationId, actionType: 'status_skip_bug', order: updated, actorRole: 'system', source: 'system_auto' });

  const draft = detectInvalidStatusTransition(fromStatus, updated.column, { orderId: target.id, correlationId });
  if (!draft) return null;

  const incident = recordIncident(draft);
  const expected = nextColumn(fromStatus) ?? 'prep';
  playbooks = {
    ...playbooks,
    [incident.id]: buildPlaybookSteps(incident, {
      description: `Повернути картку #${target.orderNumber} на очікуваний етап (${expected})`,
      action: () => {
        orders = orders.map((o) =>
          o.id === target.id ? { ...o, column: expected, prepStartedAt: new Date().toISOString() } : o,
        );
        pushEvent(`Order #${target.orderNumber} corrected back to ${expected}`);
        notify();
      },
    }),
  };
  pushEvent(`Order #${target.orderNumber} skipped a stage → ${fromStatus}→${updated.column}`);
  notify();
  return incident;
}

function simulateColumnMismatchScenario(): IncidentRecord | null {
  const target = orders.find((o) => o.column === 'prep');
  if (!target) return null;
  const correlationId = newCorrelationId();
  const dbStatus: ColumnId = target.column;

  recordStateSnapshot({
    correlationId,
    orderId: target.id,
    snapshotSource: 'db',
    status: dbStatus,
    stateVersion: new Date().toISOString(),
    statePayload: { column: dbStatus },
  });

  orders = orders.map((o) => (o.id === target.id ? { ...o, column: 'new' } : o));

  const draft = detectColumnMismatch(dbStatus, 'new', { orderId: target.id, correlationId });
  if (!draft) return null;

  const incident = recordIncident(draft);
  playbooks = {
    ...playbooks,
    [incident.id]: buildPlaybookSteps(incident, {
      description: `Синхронізувати відображення картки #${target.orderNumber} з фактичним статусом у БД (${dbStatus})`,
      action: () => {
        orders = orders.map((o) => (o.id === target.id ? { ...o, column: dbStatus } : o));
        pushEvent(`Order #${target.orderNumber} column resynced → ${dbStatus}`);
        notify();
      },
    }),
  };
  pushEvent(`Order #${target.orderNumber} rendered in the wrong column`);
  notify();
  return incident;
}

function simulateDuplicateStatusChangeScenario(): IncidentRecord | null {
  const target = pickRandomFrom(orders);
  if (!target) return null;
  const correlationIdA = newCorrelationId();
  const correlationIdB = newCorrelationId();
  const timestampA = new Date().toISOString();
  const timestampB = new Date(Date.now() + 300).toISOString();

  logOrderAction({ correlationId: correlationIdA, actionType: 'advance_status_duplicate', order: target, actorRole: 'system', source: 'system_auto' });
  logOrderAction({ correlationId: correlationIdB, actionType: 'advance_status_duplicate', order: target, actorRole: 'system', source: 'system_auto' });

  pushEvent(`Order #${target.orderNumber} status change recorded → ${target.column}`);
  pushEvent(`Order #${target.orderNumber} status change recorded → ${target.column}`);
  const duplicateEventId = events[0]?.id ?? null;

  const statusChangeEvents: StatusChangeEvent[] = [
    { orderId: target.id, toStatus: target.column, correlationId: correlationIdA, timestamp: timestampA },
    { orderId: target.id, toStatus: target.column, correlationId: correlationIdB, timestamp: timestampB },
  ];
  const draft = detectDuplicateStatusChange(statusChangeEvents, 2000)[0];
  if (!draft) return null;

  const incident = recordIncident(draft);
  playbooks = {
    ...playbooks,
    [incident.id]: buildPlaybookSteps(incident, {
      description: `Дедублікувати повторний запис про зміну статусу #${target.orderNumber}`,
      action: () => {
        if (duplicateEventId) {
          events = events.filter((e) => e.id !== duplicateEventId);
        }
        pushEvent(`Duplicate status-change record for #${target.orderNumber} removed`);
        notify();
      },
    }),
  };
  notify();
  return incident;
}

function simulateRealtimeLatencyScenario(): IncidentRecord | null {
  const target = pickRandomFrom(orders);
  if (!target) return null;
  const correlationId = newCorrelationId();
  const eventTimestamp = new Date(Date.now() - 3500).toISOString();
  const receivedTimestamp = new Date().toISOString();

  recordTechnicalTrace({
    correlationId,
    layer: 'realtime',
    functionName: 'ordersRealtimeChannel',
    eventTimestamp,
    receivedTimestamp,
    status: 'ok',
  });

  const draft = detectRealtimeLatency(
    eventTimestamp,
    receivedTimestamp,
    { orderId: target.id, correlationId },
    REALTIME_LATENCY_THRESHOLD_MS,
  );
  if (!draft) return null;

  const incident = recordIncident(draft);
  playbooks = {
    ...playbooks,
    [incident.id]: buildPlaybookSteps(incident, {
      description: 'Перепідключити realtime-канал і форсувати ресинхронізацію стану',
      action: () => {
        pushEvent('Realtime channel reconnected and resynced');
        notify();
      },
    }),
  };
  pushEvent(`Realtime event for #${target.orderNumber} delivered late`);
  notify();
  return incident;
}

function simulateStaleClientStateScenario(): IncidentRecord | null {
  const target = pickRandomFrom(orders);
  if (!target) return null;
  const correlationId = newCorrelationId();
  const localStateVersion = target.createdAt;
  const serverStateVersion = new Date().toISOString();

  const draft = detectStaleClientState(localStateVersion, serverStateVersion, { orderId: target.id, correlationId });
  if (!draft) return null;

  const incident = recordIncident(draft);
  playbooks = {
    ...playbooks,
    [incident.id]: buildPlaybookSteps(incident, {
      description: `Примусово оновити локальний стан картки #${target.orderNumber} з сервера`,
      action: () => {
        pushEvent(`Local state for #${target.orderNumber} refreshed from server`);
        notify();
      },
    }),
  };
  pushEvent(`Client is viewing a stale state for #${target.orderNumber}`);
  notify();
  return incident;
}

function simulateCrossSessionMismatchScenario(): IncidentRecord | null {
  const target = pickRandomFrom(orders);
  if (!target) return null;
  const otherStatus = nextColumn(target.column) ?? 'new';
  const otherSessionId = crypto.randomUUID();
  const now = Date.now();

  const snapshots: SessionSnapshot[] = [
    { sessionId: DEMO_SESSION_ID, orderId: target.id, status: target.column, capturedAt: new Date(now).toISOString() },
    { sessionId: otherSessionId, orderId: target.id, status: otherStatus, capturedAt: new Date(now + 500).toISOString() },
  ];
  const draft = detectCrossSessionMismatch(snapshots, 5000)[0];
  if (!draft) return null;

  recordStateSnapshot({
    orderId: target.id,
    snapshotSource: 'ui',
    sessionId: DEMO_SESSION_ID,
    status: target.column,
    stateVersion: snapshots[0].capturedAt,
  });
  recordStateSnapshot({
    orderId: target.id,
    snapshotSource: 'ui',
    sessionId: otherSessionId,
    status: otherStatus,
    stateVersion: snapshots[1].capturedAt,
  });

  const incident = recordIncident(draft);
  playbooks = {
    ...playbooks,
    [incident.id]: buildPlaybookSteps(incident, {
      description: `Розіслати авторитетний стан картки #${target.orderNumber} усім активним сесіям`,
      action: () => {
        pushEvent(`Authoritative state for #${target.orderNumber} broadcast to all sessions`);
        notify();
      },
    }),
  };
  pushEvent(`Another session shows a different status for #${target.orderNumber}`);
  notify();
  return incident;
}

function simulateRandomIncidentScenario(): IncidentRecord | null {
  const simulators = shuffle([
    simulateOrderDisappearedScenario,
    simulateStatusSkippedScenario,
    simulateColumnMismatchScenario,
    simulateDuplicateStatusChangeScenario,
    simulateRealtimeLatencyScenario,
    simulateStaleClientStateScenario,
    simulateCrossSessionMismatchScenario,
  ]);
  for (const simulate of simulators) {
    const incident = simulate();
    if (incident) return incident;
  }
  return null;
}

// "Показати шлях виправлення": focus an already-open incident, or — if the
// board is currently clean — run a fresh simulation so the analysis mode
// always has something concrete to show.
export function analyzeAndShowFixPath(): void {
  const openIncident = getIncidents().find((i) => i.status === 'open') ?? simulateRandomIncidentScenario();

  if (!openIncident) {
    pushEvent('Analysis run: no open anomalies found');
    notify();
    return;
  }

  focusedIncidentId = openIncident.id;
  notify();
}

export function applyPlaybookStep(incidentId: string): void {
  const steps = playbooks[incidentId];
  if (!steps) return;
  const pendingStep = steps.find((s) => s.status === 'pending');
  if (!pendingStep?.action) return;

  pendingStep.action();
  playbooks = {
    ...playbooks,
    [incidentId]: steps.map((s) => (s.id === pendingStep.id ? { ...s, status: 'done' as const } : s)),
  };
  resolveIncidentLocally(incidentId, 'Fix applied via ScenarioPanel');
  notify();
}

export function closeFixPath(): void {
  focusedIncidentId = null;
  notify();
}

function ensureAutoIncident() {
  if (autoIncidentRegistered) return;
  autoIncidentRegistered = true;
  if (orders.length === 0) {
    insertMockOrder();
  }
  simulateRandomIncidentScenario();
}

function ensureClockStarted() {
  if (clockIntervalId !== null) return;
  clockIntervalId = window.setInterval(checkAutoProgress, CLOCK_TICK_MS);
}

function subscribe(onStoreChange: () => void): () => void {
  ensureClockStarted();
  ensureAutoIncident();
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
