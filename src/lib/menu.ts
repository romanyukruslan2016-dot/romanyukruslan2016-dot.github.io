// Single source of truth for the restaurant menu — both the mock-order
// generator (demoEngine.ts) and the ordering agent (agent/tools.ts) read
// from here, so there is exactly one place that defines what a "known dish"
// or "known modifier" is.

export interface MenuItem {
  name: string;
  price: number;
  availableModifiers: string[];
}

export const MENU_ITEMS: MenuItem[] = [
  { name: 'Борщ', price: 95, availableModifiers: ['Без сметани', 'Гострий', 'Подвійна порція'] },
  { name: 'Вареники', price: 120, availableModifiers: ['З картоплею', 'З сиром', "З м'ясом", 'Смажені'] },
  { name: 'Стейк', price: 320, availableModifiers: ['Medium rare', 'Well done', 'Без солі', 'З перцевим соусом'] },
  { name: 'Салат Цезар', price: 145, availableModifiers: ['Без грінок', 'Без анчоусів', 'З куркою'] },
  { name: 'Піца Маргарита', price: 210, availableModifiers: ['Тонке тісто', 'Без цибулі', 'Подвійний сир'] },
  { name: 'Курка гриль', price: 180, availableModifiers: ['Гостра', 'З лимоном', 'Без шкірки'] },
  { name: 'Деруни', price: 110, availableModifiers: ['Зі сметаною', 'З грибним соусом'] },
  { name: 'Шашлик', price: 250, availableModifiers: ['Гострий маринад', 'Без цибулі', 'Подвійна порція'] },
];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export function findMenuItem(dishName: string): MenuItem | undefined {
  const target = normalize(dishName);
  return MENU_ITEMS.find((item) => normalize(item.name) === target);
}

export function isKnownModifier(item: MenuItem, modifier: string): boolean {
  const target = normalize(modifier);
  return item.availableModifiers.some((m) => normalize(m) === target);
}
