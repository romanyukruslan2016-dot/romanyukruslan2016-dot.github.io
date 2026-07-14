// The chain: drives the ordering conversation turn by turn, holding the only
// state that exists for this agent — an in-memory ConversationState that
// lives for the duration of one chat session and is never persisted or
// shared across sessions. `handleUserMessage` is a pure function (state in,
// state out) so the React layer (ChatWidget) just needs a single useState.
//
// Guardrail enforced here, in code, not just in the prompt: createOrder is
// only ever called from the 'confirm' branch, and only when
// `state.awaitingConfirmation` is true — there is no other call site.

import { localAgentModel, type DraftItemIntent, type ModelContext } from './model';
import { createOrder, getMenu, getOrderStatus } from './tools';
import type { CreateOrderFailureReason } from './types';

export interface DraftOrderItem {
  dishName: string;
  modifiers: string[];
  quantity: number;
}

export interface DraftOrder {
  tableNumber: number | null;
  customerName: string | null;
  items: DraftOrderItem[];
}

export interface ChatMessage {
  id: string;
  role: 'agent' | 'user';
  text: string;
}

export interface ConversationState {
  messages: ChatMessage[];
  draft: DraftOrder;
  awaitingConfirmation: boolean;
  closed: boolean;
}

const GREETING = 'Вітаю! Я допоможу оформити замовлення. За яким столом ви сидите?';

function agentMessage(text: string): ChatMessage {
  return { id: crypto.randomUUID(), role: 'agent', text };
}

function userMessage(text: string): ChatMessage {
  return { id: crypto.randomUUID(), role: 'user', text };
}

export function createInitialState(): ConversationState {
  return {
    messages: [agentMessage(GREETING)],
    draft: { tableNumber: null, customerName: null, items: [] },
    awaitingConfirmation: false,
    closed: false,
  };
}

function formatItemLine(item: DraftOrderItem): string {
  const mods = item.modifiers.length > 0 ? ` (${item.modifiers.join(', ')})` : '';
  return `${item.dishName}${mods} x${item.quantity}`;
}

function formatMenu(): string {
  return getMenu()
    .map((item) => `- ${item.name} — ${item.price} грн`)
    .join('\n');
}

function formatSummary(draft: DraftOrder): string {
  const lines = draft.items.map((item) => `- ${formatItemLine(item)}`).join('\n');
  return `Підсумок замовлення для столу ${draft.tableNumber}:\n${lines}\n\nПідтверджуєте замовлення? (так/ні)`;
}

function mergeItemsIntoDraft(draft: DraftOrder, incoming: DraftItemIntent[]): DraftOrder {
  const items = [...draft.items];
  for (const next of incoming) {
    const existing = items.find(
      (item) =>
        item.dishName === next.dishName &&
        item.modifiers.length === next.modifiers.length &&
        item.modifiers.every((m) => next.modifiers.includes(m)),
    );
    if (existing) {
      existing.quantity += next.quantity;
    } else {
      items.push({ dishName: next.dishName, modifiers: next.modifiers, quantity: next.quantity });
    }
  }
  return { ...draft, items };
}

function describeFailure(reason: CreateOrderFailureReason): string {
  switch (reason) {
    case 'unknown_dish':
      return `Перепрошую, такої страви немає в меню. Ось що є:\n${formatMenu()}`;
    case 'unknown_modifier':
      return 'Перепрошую, такого побажання немає для цієї страви. Спробуємо ще раз?';
    case 'invalid_table':
      return 'Номер столу виглядає некоректним. Назвіть, будь ласка, номер столу ще раз.';
    case 'empty_order':
      return 'Замовлення поки порожнє. Що бажаєте додати?';
  }
}

export function handleUserMessage(state: ConversationState, userText: string): ConversationState {
  const messages = [...state.messages, userMessage(userText)];

  if (state.closed) {
    return {
      ...state,
      messages: [...messages, agentMessage('Це замовлення вже оформлено. Якщо потрібно щось іще — покличте, будь ласка, офіціанта.')],
    };
  }

  const ctx: ModelContext = {
    hasTableNumber: state.draft.tableNumber !== null,
    awaitingConfirmation: state.awaitingConfirmation,
  };
  const intent = localAgentModel.interpret(userText, ctx);

  switch (intent.type) {
    case 'out_of_scope': {
      return {
        ...state,
        messages: [...messages, agentMessage('Перепрошую, цим я не займаюся. Покликати, будь ласка, офіціанта?')],
      };
    }

    case 'ask_menu': {
      return {
        ...state,
        messages: [...messages, agentMessage(`Ось наше меню:\n${formatMenu()}\n\nЩо бажаєте замовити?`)],
      };
    }

    case 'check_status': {
      const result = getOrderStatus(intent.orderNumber);
      const text = result.ok
        ? `Замовлення №${intent.orderNumber}: статус "${result.status}", в роботі вже ${result.minutesElapsed} хв.`
        : `Не знайшов замовлення №${intent.orderNumber}. Перевірте, будь ласка, номер.`;
      return { ...state, messages: [...messages, agentMessage(text)] };
    }

    case 'unrecognized_dish': {
      return {
        ...state,
        messages: [...messages, agentMessage(`На жаль, такої страви немає в меню. Ось що є:\n${formatMenu()}`)],
      };
    }

    case 'provide_table': {
      let draft: DraftOrder = { ...state.draft, tableNumber: intent.tableNumber };
      const acks: string[] = [`Записав стіл №${intent.tableNumber}.`];
      if (intent.items && intent.items.length > 0) {
        draft = mergeItemsIntoDraft(draft, intent.items);
        acks.push(...intent.items.map((item) => `Додав: ${formatItemLine(item)}.`));
      }
      acks.push(draft.items.length > 0 ? 'Бажаєте щось іще, чи це все?' : 'Що бажаєте замовити?');
      return { ...state, draft, messages: [...messages, agentMessage(acks.join(' '))] };
    }

    case 'add_items': {
      const draft = mergeItemsIntoDraft(state.draft, intent.items);
      const acks = intent.items.map((item) => `Додав: ${formatItemLine(item)}.`);
      if (draft.tableNumber === null) {
        acks.push('Підкажіть, будь ласка, номер столу.');
      } else {
        acks.push('Бажаєте щось іще, чи це все?');
      }
      return { ...state, draft, messages: [...messages, agentMessage(acks.join(' '))] };
    }

    case 'done_ordering': {
      if (state.draft.items.length === 0) {
        return { ...state, messages: [...messages, agentMessage('Ви ще нічого не обрали. Що будете замовляти?')] };
      }
      if (state.draft.tableNumber === null) {
        return { ...state, messages: [...messages, agentMessage('Перш ніж підтвердити, назвіть, будь ласка, номер столу.')] };
      }
      return {
        ...state,
        awaitingConfirmation: true,
        messages: [...messages, agentMessage(formatSummary(state.draft))],
      };
    }

    case 'confirm': {
      if (!state.awaitingConfirmation) {
        return {
          ...state,
          messages: [...messages, agentMessage("Наразі немає що підтверджувати. Скажіть, що бажаєте замовити, або напишіть «це все», коли будете готові.")],
        };
      }

      const result = createOrder({
        tableNumber: state.draft.tableNumber!,
        items: state.draft.items.map((item) => ({
          dishName: item.dishName,
          modifiers: item.modifiers,
          quantity: item.quantity,
        })),
      });

      if (result.ok) {
        return {
          ...state,
          awaitingConfirmation: false,
          closed: true,
          messages: [
            ...messages,
            agentMessage(`Готово! Замовлення №${result.orderNumber} оформлено, орієнтовний час — ${result.estimatedMinutes} хв. Дякуємо!`),
          ],
        };
      }

      const draft = result.reason === 'invalid_table' ? { ...state.draft, tableNumber: null } : state.draft;
      return {
        ...state,
        draft,
        awaitingConfirmation: false,
        messages: [...messages, agentMessage(describeFailure(result.reason))],
      };
    }

    case 'decline': {
      return {
        ...state,
        awaitingConfirmation: false,
        messages: [
          ...messages,
          agentMessage('Добре, поки не підтверджую. Можете щось змінити або знову написати «це все», коли будете готові.'),
        ],
      };
    }

    case 'unknown': {
      const prompt =
        state.draft.tableNumber === null
          ? 'Не зовсім зрозумів. Підкажіть, будь ласка, номер столу?'
          : 'Не зовсім зрозумів. Можете уточнити, що бажаєте замовити?';
      return { ...state, messages: [...messages, agentMessage(prompt)] };
    }
  }
}
