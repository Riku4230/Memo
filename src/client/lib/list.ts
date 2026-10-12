import type { Category, Memo } from '../../shared/types';
import type { ViewMode } from './prefs';

export interface ListFilter {
  /** 買ったものも出すか（出すときは一覧のいちばん下にまとめる） */
  showDone: boolean;
  categoryId: string | null;
  q: string;
}

export interface ListGroup {
  key: string;
  /** 小見出し（中カテゴリ）。null なら小見出しなし */
  title: string | null;
  memos: Memo[];
}
export interface ListSection {
  key: string;
  /** 見出し。null なら見出しなし（新しい順） */
  title: string | null;
  category: Category | null;
  /** 買ったものの見出し */
  done: boolean;
  count: number;
  groups: ListGroup[];
}

export const NO_CATEGORY = 'カテゴリなし';
export const NO_SUBCATEGORY = 'そのほか';
export const DONE_TITLE = '買ったもの';

/** 全角・半角や大文字・小文字の違いを気にせず探せるようにする */
function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

/** 絞り込み（買ったかどうかは見ない） */
export function matchesFilter(m: Memo, f: Pick<ListFilter, 'categoryId' | 'q'>): boolean {
  if (f.categoryId && m.categoryId !== f.categoryId) return false;
  const q = norm(f.q.trim());
  if (q) {
    const words = q.split(/\s+/);
    const hay = norm([m.title, m.body, ...m.links.map((l) => l.label)].join('\n'));
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** 欲しいものは追加した新しい順、買ったものは買った新しい順 */
export function sortMemos(list: Memo[], done: boolean): Memo[] {
  const key = (m: Memo) => (done ? (m.doneAt ?? m.createdAt) : m.createdAt);
  return [...list].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
}

/** 中カテゴリの小見出しに分ける（中カテゴリの並び順。中カテゴリなしは最後の「そのほか」。中カテゴリが1つも使われていなければ小見出しなし） */
function bySubcategory(memos: Memo[], category: Category): ListGroup[] {
  if (!memos.some((m) => m.subcategoryId)) return [{ key: `${category.id}:all`, title: null, memos }];
  const groups: ListGroup[] = [];
  for (const s of category.subcategories) {
    const list = memos.filter((m) => m.subcategoryId === s.id);
    if (list.length) groups.push({ key: `${category.id}:${s.id}`, title: s.name, memos: list });
  }
  const known = new Set(category.subcategories.map((s) => s.id));
  const rest = memos.filter((m) => !m.subcategoryId || !known.has(m.subcategoryId));
  if (rest.length) groups.push({ key: `${category.id}:none`, title: NO_SUBCATEGORY, memos: rest });
  return groups;
}

/**
 * 絞り込んだメモを、並べ方に合わせて見出しに分ける。
 * - recent: 欲しいものを見出しなしで1列
 * - category: 大カテゴリの見出し、その中を中カテゴリの小見出しに分ける。大カテゴリのないメモは最後の「カテゴリなし」
 * 買ったものも出すときは、いちばん下に「買ったもの」の見出しでまとめる（並べ方にかかわらず1列）
 */
export function buildSections(memos: Memo[], filter: ListFilter, mode: ViewMode, categories: Category[]): ListSection[] {
  const matched = memos.filter((m) => matchesFilter(m, filter));
  const open = sortMemos(matched.filter((m) => !m.doneAt), false);
  const sections: ListSection[] = [];
  if (mode === 'recent') {
    if (open.length) sections.push({ key: 'open', title: null, category: null, done: false, count: open.length, groups: [{ key: 'open', title: null, memos: open }] });
  } else {
    for (const c of categories) {
      const list = open.filter((m) => m.categoryId === c.id);
      if (list.length) sections.push({ key: `c:${c.id}`, title: c.name, category: c, done: false, count: list.length, groups: bySubcategory(list, c) });
    }
    const known = new Set(categories.map((c) => c.id));
    const rest = open.filter((m) => !m.categoryId || !known.has(m.categoryId));
    if (rest.length) sections.push({ key: 'c:none', title: NO_CATEGORY, category: null, done: false, count: rest.length, groups: [{ key: 'none', title: null, memos: rest }] });
  }
  if (filter.showDone) {
    const done = sortMemos(matched.filter((m) => m.doneAt), true);
    if (done.length) sections.push({ key: 'done', title: DONE_TITLE, category: null, done: true, count: done.length, groups: [{ key: 'done', title: null, memos: done }] });
  }
  return sections;
}
