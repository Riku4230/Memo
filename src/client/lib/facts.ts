import { daysBetween, dateJst } from '../../shared/date';
import { isStale, sortOffers } from '../../shared/memo';
import type { Memo, Tag } from '../../shared/types';
import type { OruFacts } from './oru';

/** おるのひとことに使う、メモの数字 */
export function computeOruFacts(memos: Memo[], storeMap: Map<string, Tag>, today: string): OruFacts {
  const open = memos.filter((m) => !m.doneAt);
  const perStore = new Map<string, number>();
  for (const m of open) for (const o of m.offers) perStore.set(o.storeId, (perStore.get(o.storeId) ?? 0) + 1);
  let topStore: OruFacts['topStore'] = null;
  for (const [id, count] of perStore) {
    const s = storeMap.get(id);
    if (s && (!topStore || count > topStore.count)) topStore = { name: s.name, count };
  }
  let oldest: OruFacts['oldest'] = null;
  for (const m of open) {
    const days = daysBetween(dateJst(m.createdAt), today);
    if (days >= 30 && (!oldest || days > oldest.days)) oldest = { title: m.title, days };
  }
  let cheapest: OruFacts['cheapest'] = null;
  for (const m of open) {
    const priced = sortOffers(m.offers.filter((o) => o.price !== null));
    if (priced.length < 2) continue;
    const diff = priced[1]!.price! - priced[0]!.price!;
    const store = storeMap.get(priced[0]!.storeId);
    if (diff > 0 && store) {
      cheapest = { title: m.title, store: store.name, diff };
      break;
    }
  }
  const staleCount = open.reduce((n, m) => n + m.offers.filter((o) => isStale(o, today)).length, 0);
  return { openCount: open.length, topStore, oldest, cheapest, staleCount };
}
