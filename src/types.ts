export type ColumnId = 'new' | 'prep' | 'ready';

export interface Dish {
  name: string;
  modifiers: string[];
}

export interface Order {
  id: string;
  orderNumber: number;
  tableNumber: number;
  dishes: Dish[];
  column: ColumnId;
  createdAt: string;
  prepStartedAt?: string;
  readyStartedAt?: string;
}

export interface TableCounts {
  orders: number;
  order_items: number;
  order_modifiers: number;
  kitchen_stations: number;
  order_status_history: number;
}

export interface EngineEvent {
  id: string;
  time: string;
  text: string;
}

export interface EngineSnapshot {
  orders: Order[];
  events: EngineEvent[];
  tableCounts: TableCounts;
  autoplay: boolean;
}

export const COLUMN_ORDER: ColumnId[] = ['new', 'prep', 'ready'];

export const COLUMN_LABELS: Record<ColumnId, string> = {
  new: 'New',
  prep: 'Prep',
  ready: 'Ready',
};

export function nextColumn(current: ColumnId): ColumnId | null {
  const idx = COLUMN_ORDER.indexOf(current);
  return idx < COLUMN_ORDER.length - 1 ? COLUMN_ORDER[idx + 1] : null;
}
