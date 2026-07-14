// The "model" layer: turns a raw user message into a structured Intent.
// This is the extension point named in the architecture — today
// `localAgentModel` is a keyword/regex NLU with no external calls; later a
// `createLlmAgentModel(apiKey)` implementing the same `AgentModel` interface
// (via Claude/GPT function-calling against this same Intent shape, primed
// with AGENT_SYSTEM_PROMPT from systemPrompt.ts) can replace it without
// touching conversation.ts, which only ever consumes `Intent`.
//
// The Ukrainian matching below is deliberately approximate: it stems words
// by comparing a short shared prefix instead of doing real morphological
// analysis, so it tolerates case endings ("борщу", "вареників") without a
// dictionary. A real LLM removes the need for this entirely.

import { MENU_ITEMS, type MenuItem } from '../menu';

export interface DraftItemIntent {
  dishName: string;
  modifiers: string[];
  quantity: number;
}

export type Intent =
  | { type: 'provide_table'; tableNumber: number; items?: DraftItemIntent[] }
  | { type: 'add_items'; items: DraftItemIntent[] }
  | { type: 'ask_menu' }
  | { type: 'done_ordering' }
  | { type: 'confirm' }
  | { type: 'decline' }
  | { type: 'check_status'; orderNumber: number }
  | { type: 'out_of_scope'; note: string }
  | { type: 'unrecognized_dish' }
  | { type: 'unknown' };

export interface ModelContext {
  hasTableNumber: boolean;
  awaitingConfirmation: boolean;
}

export interface AgentModel {
  interpret(userText: string, ctx: ModelContext): Intent;
}

// JS's \b only recognizes ASCII word characters, so it silently fails to
// bound Cyrillic words (a plain /\bтак\b/ never matches "так" at all). These
// keyword regexes build boundaries manually via lookaround against an
// explicit Ukrainian-letter class instead.
const L = "a-zа-яіїєґ'’";

function bounded(alternation: string): RegExp {
  return new RegExp(`(?<![${L}])(?:${alternation})(?![${L}])`, 'iu');
}

const CONFIRM_RE = bounded(`так|підтвердж[${L}]*|ок|окей|давай|згод[${L}]*|вірно|правильно`);
const DECLINE_RE = bounded(`ні|не\\s*треба|скасу[${L}]*|відмін[${L}]*|передумав[${L}]*|стоп`);
const MENU_QUESTION_RE = bounded(`меню|що\\s*(?:є|у\\s*вас)|які\\s*страви|покажи[${L}]*\\s*меню`);
const DONE_RE = bounded(`все|усе|більше\\s*нічого|готово|достатньо|закінчив[${L}]*`);
const OUT_OF_SCOPE_RE = bounded(`цін[${L}]*|знижк[${L}]*|дешевш[${L}]*|оплат[${L}]*|заплат[${L}]*|розрахуватис[${L}]*`);
const WANT_VERB_RE = bounded(`хочу|хотів\\s*би|хотіла\\s*би|замовити|замовляю|дайте|можна\\s*мені|принес[${L}]*`);

const STATUS_QUERY_RE = /(?:замовленн\w*|статус)\D{0,10}(\d{2,6})/iu;
const TABLE_KEYWORD_RE = /(?:стіл\w*|стол\w*|столик\w*)\D{0,5}(\d{1,3})/iu;
const BARE_NUMBER_RE = /^\s*(\d{1,3})\s*[.!]?\s*$/;

const QUANTITY_WORDS: Record<string, number> = {
  один: 1,
  одна: 1,
  одну: 1,
  два: 2,
  дві: 2,
  три: 3,
  чотири: 4,
  "п'ять": 5,
  пять: 5,
};

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-zа-яіїєґ']+|\d+/giu) ?? [];
}

function stemMatch(a: string, b: string): boolean {
  const minLen = Math.min(a.length, b.length);
  if (minLen === 0) return false;
  if (minLen <= 3) return a.slice(0, minLen) === b.slice(0, minLen) && Math.abs(a.length - b.length) <= 1;
  const prefixLen = minLen <= 5 ? minLen - 1 : 4;
  return a.slice(0, prefixLen) === b.slice(0, prefixLen);
}

function findTokenIndex(tokens: string[], word: string): number {
  return tokens.findIndex((t) => stemMatch(t, word));
}

function dishMentionIndex(tokens: string[], item: MenuItem): number {
  const dishWords = item.name.toLowerCase().split(/\s+/);
  for (const word of dishWords) {
    const idx = findTokenIndex(tokens, word);
    if (idx !== -1) return idx;
  }
  return -1;
}

function modifierMentioned(tokens: string[], modifier: string): boolean {
  const words = modifier.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return false;
  return words.every((word) => findTokenIndex(tokens, word) !== -1);
}

function quantityNear(tokens: string[], index: number): number {
  for (const neighborIdx of [index - 1, index + 1]) {
    const token = tokens[neighborIdx];
    if (!token) continue;
    if (/^\d+$/.test(token)) return Math.max(1, parseInt(token, 10));
    if (token in QUANTITY_WORDS) return QUANTITY_WORDS[token];
  }
  return 1;
}

function extractItems(text: string): DraftItemIntent[] {
  const tokens = tokenize(text);
  const items: DraftItemIntent[] = [];

  for (const menuItem of MENU_ITEMS) {
    const idx = dishMentionIndex(tokens, menuItem);
    if (idx === -1) continue;

    const modifiers = menuItem.availableModifiers.filter((mod) => modifierMentioned(tokens, mod));
    const quantity = quantityNear(tokens, idx);
    items.push({ dishName: menuItem.name, modifiers, quantity });
  }

  return items;
}

function localInterpret(userText: string, ctx: ModelContext): Intent {
  const text = userText.trim();
  if (text.length === 0) return { type: 'unknown' };

  if (OUT_OF_SCOPE_RE.test(text)) {
    return { type: 'out_of_scope', note: text };
  }

  if (ctx.awaitingConfirmation) {
    if (CONFIRM_RE.test(text)) return { type: 'confirm' };
    if (DECLINE_RE.test(text)) return { type: 'decline' };
  }

  const statusMatch = text.match(STATUS_QUERY_RE);
  if (statusMatch) {
    return { type: 'check_status', orderNumber: parseInt(statusMatch[1], 10) };
  }

  if (MENU_QUESTION_RE.test(text)) {
    return { type: 'ask_menu' };
  }

  const keywordMatch = text.match(TABLE_KEYWORD_RE);
  const bareMatch = !ctx.hasTableNumber ? text.match(BARE_NUMBER_RE) : null;
  if (keywordMatch || bareMatch) {
    const tableMatch = (keywordMatch ?? bareMatch)!;
    const tableNumber = parseInt(tableMatch[1], 10);
    // Drop the matched "стіл N" phrase before scanning for dishes, so the
    // table digit itself can't be picked up as a dish quantity.
    const remainder = text.slice(0, tableMatch.index) + text.slice(tableMatch.index! + tableMatch[0].length);
    const items = extractItems(remainder);
    return items.length > 0
      ? { type: 'provide_table', tableNumber, items }
      : { type: 'provide_table', tableNumber };
  }

  const items = extractItems(text);
  if (items.length > 0) {
    return { type: 'add_items', items };
  }

  if (WANT_VERB_RE.test(text)) {
    return { type: 'unrecognized_dish' };
  }

  if (DONE_RE.test(text)) {
    return { type: 'done_ordering' };
  }

  return { type: 'unknown' };
}

export const localAgentModel: AgentModel = { interpret: localInterpret };
