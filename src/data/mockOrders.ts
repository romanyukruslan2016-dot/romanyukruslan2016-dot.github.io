import type { Order } from '../types';

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

export const initialOrders: Order[] = [
  {
    id: '1',
    orderNumber: 1042,
    tableNumber: 7,
    column: 'new',
    createdAt: minutesAgo(3),
    dishes: [
      { name: 'Classic Burger', modifiers: ['No onion', 'Well done'] },
      { name: 'Truffle Fries', modifiers: ['Extra crispy'] },
    ],
  },
  {
    id: '2',
    orderNumber: 1043,
    tableNumber: 3,
    column: 'new',
    createdAt: minutesAgo(7),
    dishes: [
      { name: 'Caesar Salad', modifiers: ['No croutons'] },
      { name: 'Grilled Salmon', modifiers: ['Medium'] },
    ],
  },
  {
    id: '3',
    orderNumber: 1044,
    tableNumber: 12,
    column: 'prep',
    createdAt: minutesAgo(11),
    dishes: [
      { name: 'Margherita Pizza', modifiers: ['Thin crust'] },
      { name: 'Garlic Bread', modifiers: [] },
    ],
  },
  {
    id: '4',
    orderNumber: 1045,
    tableNumber: 5,
    column: 'prep',
    createdAt: minutesAgo(16),
    dishes: [
      { name: 'Ribeye Steak', modifiers: ['Medium rare', 'No butter'] },
      { name: 'Mashed Potatoes', modifiers: ['Extra gravy'] },
    ],
  },
  {
    id: '5',
    orderNumber: 1046,
    tableNumber: 9,
    column: 'ready',
    createdAt: minutesAgo(21),
    dishes: [
      { name: 'Fish & Chips', modifiers: ['Tartar on side'] },
      { name: 'Coleslaw', modifiers: [] },
    ],
  },
];
