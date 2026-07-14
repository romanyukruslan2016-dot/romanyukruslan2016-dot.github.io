import { describe, expect, it, vi } from 'vitest';
import { createInitialState, handleUserMessage } from './conversation';
import { getOrderByNumber } from '../demoEngine';
import { createOrder } from './tools';

// Spy on the real createOrder so we can assert it was (or wasn't) called,
// while still letting it run for real — this is the same audit-trailed
// write path used by ScenarioPanel's buttons, not a parallel one.
vi.mock('./tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tools')>();
  return { ...actual, createOrder: vi.fn(actual.createOrder) };
});

function lastReply(state: ReturnType<typeof createInitialState>): string {
  return state.messages[state.messages.length - 1].text;
}

describe('ordering agent chain — Definition of Done scenarios', () => {
  it('1. single dish with modifier + table given upfront -> order created, number reported', () => {
    let state = createInitialState();
    state = handleUserMessage(state, 'Столик 5, борщ гострий будь ласка');
    expect(state.draft.tableNumber).toBe(5);
    expect(state.draft.items).toEqual([{ dishName: 'Борщ', modifiers: ['Гострий'], quantity: 1 }]);

    state = handleUserMessage(state, 'це все');
    expect(state.awaitingConfirmation).toBe(true);
    expect(lastReply(state)).toContain('Підтверджуєте');

    const callsBefore = vi.mocked(createOrder).mock.calls.length;
    state = handleUserMessage(state, 'так, підтверджую');
    expect(vi.mocked(createOrder).mock.calls.length).toBe(callsBefore + 1);
    expect(state.closed).toBe(true);

    const match = lastReply(state).match(/№(\d+)/);
    expect(match).not.toBeNull();
    const orderNumber = parseInt(match![1], 10);
    const order = getOrderByNumber(orderNumber);
    expect(order?.tableNumber).toBe(5);
    expect(order?.dishes).toEqual([{ name: 'Борщ', modifiers: ['Гострий'] }]);
  });

  it('2. no table mentioned -> agent keeps asking until it gets one', () => {
    let state = createInitialState();
    state = handleUserMessage(state, 'Хочу вареники з сиром');
    expect(state.draft.tableNumber).toBeNull();
    expect(state.draft.items).toHaveLength(1);
    expect(lastReply(state)).toMatch(/стол/iu);

    state = handleUserMessage(state, 'ой вибачте, ще не сказав');
    expect(state.draft.tableNumber).toBeNull();

    state = handleUserMessage(state, 'стіл 9');
    expect(state.draft.tableNumber).toBe(9);
  });

  it('3. dish not on the menu -> polite refusal + menu offered', () => {
    let state = createInitialState();
    state = handleUserMessage(state, 'стіл 3');
    state = handleUserMessage(state, 'Хочу суші будь ласка');
    expect(state.draft.items).toHaveLength(0);
    expect(lastReply(state)).toContain('немає в меню');
    expect(lastReply(state)).toContain('Борщ');
  });

  it('4. several dishes added one by one, then confirmed -> single order with all items', () => {
    let state = createInitialState();
    state = handleUserMessage(state, 'стіл 12');
    state = handleUserMessage(state, 'Борщ без сметани');
    state = handleUserMessage(state, 'І ще стейк medium rare');
    expect(state.draft.items).toHaveLength(2);

    state = handleUserMessage(state, 'готово');
    expect(state.awaitingConfirmation).toBe(true);

    state = handleUserMessage(state, 'підтверджую');
    expect(state.closed).toBe(true);

    const orderNumber = parseInt(lastReply(state).match(/№(\d+)/)![1], 10);
    const order = getOrderByNumber(orderNumber);
    expect(order?.dishes).toHaveLength(2);
    expect(order?.dishes.map((d) => d.name).sort()).toEqual(['Борщ', 'Стейк'].sort());
  });

  it('5. declines at confirmation step -> createOrder is never called', () => {
    let state = createInitialState();
    state = handleUserMessage(state, 'стіл 4');
    state = handleUserMessage(state, 'деруни зі сметаною');
    state = handleUserMessage(state, 'це все');
    expect(state.awaitingConfirmation).toBe(true);

    const callsBefore = vi.mocked(createOrder).mock.calls.length;
    state = handleUserMessage(state, 'ні, не треба');
    expect(vi.mocked(createOrder).mock.calls.length).toBe(callsBefore);
    expect(state.closed).toBe(false);
    expect(state.awaitingConfirmation).toBe(false);
  });

  it('6. a created order is visible through the same store WorkflowBoard/ScenarioPanel read', () => {
    let state = createInitialState();
    state = handleUserMessage(state, 'стіл 8, курка гриль гостра');
    state = handleUserMessage(state, 'все');
    state = handleUserMessage(state, 'так');
    expect(state.closed).toBe(true);

    const orderNumber = parseInt(lastReply(state).match(/№(\d+)/)![1], 10);
    // getOrderByNumber reads the same module-level `orders` array that
    // useDemoEngine's snapshot feeds to WorkflowBoard/ScenarioPanel — there
    // is no separate agent-only store.
    const order = getOrderByNumber(orderNumber);
    expect(order).toBeDefined();
    expect(order?.tableNumber).toBe(8);
    expect(order?.column).toBe('new');
  });
});
