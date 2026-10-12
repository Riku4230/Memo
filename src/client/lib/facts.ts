import { daysBetween, dateJst } from '../../shared/date';
import type { Category, Memo } from '../../shared/types';
import type { OruFacts } from './oru';

/** おるのひとことに使う、メモの数字 */
export function computeOruFacts(memos: Memo[], categoryMap: Map<string, Category>, today: string): OruFacts {
  const open = memos.filter((m) => !m.doneAt);
  // 中カテゴリ（ダイソーなど）があればその名前、なければ大カテゴリの名前ごとに数える
  const perPlace = new Map<string, number>();
  for (const m of open) {
    const cat = m.categoryId ? categoryMap.get(m.categoryId) : undefined;
    if (!cat) continue;
    const name = cat.subcategories.find((s) => s.id === m.subcategoryId)?.name ?? cat.name;
    perPlace.set(name, (perPlace.get(name) ?? 0) + 1);
  }
  let topPlace: OruFacts['topPlace'] = null;
  for (const [name, count] of perPlace) if (!topPlace || count > topPlace.count) topPlace = { name, count };
  let oldest: OruFacts['oldest'] = null;
  for (const m of open) {
    const days = daysBetween(dateJst(m.createdAt), today);
    if (days >= 30 && (!oldest || days > oldest.days)) oldest = { title: m.title, days };
  }
  return { openCount: open.length, topPlace, oldest };
}
