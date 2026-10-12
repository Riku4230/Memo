import type { Memo, Tag } from '../../shared/types';
import type { ViewMode } from './prefs';

export interface ListFilter {
  state: 'open' | 'done';
  storeId: string | null;
  genreId: string | null;
  q: string;
}

/** 一覧の1行。storeId は「購入先ごと」の並べ方で、どの購入先の見出しの下に出ているか（その店の値段を出す） */
export interface ListRow {
  memo: Memo;
  storeId: string | null;
}
export interface ListGroup {
  key: string;
  /** 小見出し（ジャンル）。null なら小見出しなし */
  title: string | null;
  rows: ListRow[];
}
export interface ListSection {
  key: string;
  /** 見出し。null なら見出しなし（新しい順） */
  title: string | null;
  tag: Tag | null;
  count: number;
  groups: ListGroup[];
}

export const NO_GENRE = 'ジャンルなし';
export const NO_STORE = '購入先なし';

/** 全角・半角や大文字・小文字の違いを気にせず探せるようにする */
function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

export function matchesFilter(m: Memo, f: ListFilter): boolean {
  if ((f.state === 'done') !== (m.doneAt !== null)) return false;
  if (f.genreId && m.genreId !== f.genreId) return false;
  if (f.storeId && !m.offers.some((o) => o.storeId === f.storeId)) return false;
  const q = norm(f.q.trim());
  if (q) {
    const words = q.split(/\s+/);
    const hay = norm([m.title, m.body, ...m.offers.map((o) => o.note), ...m.links.map((l) => l.label)].join('\n'));
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** 欲しいものは追加した新しい順、買ったものは買った新しい順 */
export function sortMemos(list: Memo[], state: 'open' | 'done'): Memo[] {
  const key = (m: Memo) => (state === 'done' ? (m.doneAt ?? m.createdAt) : m.createdAt);
  return [...list].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
}

/** ジャンルの小見出しに分ける（ジャンルの並び順。ジャンルなしは最後） */
function byGenre(rows: ListRow[], genres: Tag[], prefix: string): ListGroup[] {
  const groups: ListGroup[] = [];
  for (const g of genres) {
    const list = rows.filter((r) => r.memo.genreId === g.id);
    if (list.length) groups.push({ key: `${prefix}:${g.id}`, title: g.name, rows: list });
  }
  const known = new Set(genres.map((g) => g.id));
  const rest = rows.filter((r) => !r.memo.genreId || !known.has(r.memo.genreId));
  if (rest.length) groups.push({ key: `${prefix}:none`, title: NO_GENRE, rows: rest });
  return groups;
}

/**
 * 絞り込んだメモを、並べ方に合わせて見出しに分ける。
 * - recent: 見出しなしで1列
 * - store: 購入先 › ジャンル の2段。購入先が2つあるメモは両方の見出しの下に出る。購入先のないメモは最後の「購入先なし」
 * - genre: ジャンルの見出し。ジャンルのないメモは最後の「ジャンルなし」
 */
export function buildSections(memos: Memo[], filter: ListFilter, mode: ViewMode, stores: Tag[], genres: Tag[]): ListSection[] {
  const list = sortMemos(memos.filter((m) => matchesFilter(m, filter)), filter.state);
  if (mode === 'recent') {
    return list.length ? [{ key: 'all', title: null, tag: null, count: list.length, groups: [{ key: 'all', title: null, rows: list.map((memo) => ({ memo, storeId: null })) }] }] : [];
  }
  if (mode === 'genre') {
    return byGenre(list.map((memo) => ({ memo, storeId: null })), genres, 'g').map((g) => ({
      key: g.key,
      title: g.title,
      tag: genres.find((t) => `g:${t.id}` === g.key) ?? null,
      count: g.rows.length,
      groups: [{ ...g, title: null }],
    }));
  }
  const sections: ListSection[] = [];
  for (const s of stores) {
    if (filter.storeId && filter.storeId !== s.id) continue;
    const rows = list.filter((m) => m.offers.some((o) => o.storeId === s.id)).map((memo) => ({ memo, storeId: s.id }));
    if (rows.length) sections.push({ key: `s:${s.id}`, title: s.name, tag: s, count: rows.length, groups: byGenre(rows, genres, `s:${s.id}`) });
  }
  const known = new Set(stores.map((s) => s.id));
  const none = list.filter((m) => !m.offers.some((o) => known.has(o.storeId))).map((memo) => ({ memo, storeId: null }));
  if (none.length && !filter.storeId) sections.push({ key: 's:none', title: NO_STORE, tag: null, count: none.length, groups: byGenre(none, genres, 's:none') });
  return sections;
}
