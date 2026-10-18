import { dateJst, daysBetween } from '../../shared/date';
import type { Category, Memo } from '../../shared/types';
import type { ViewMode } from './prefs';

export interface ListFilter {
  /** 大カテゴリで絞り込む（中カテゴリで絞るときは null） */
  categoryId: string | null;
  /** 中カテゴリの名前で絞り込む。どの大カテゴリの中でも、同じ名前なら同じものとして扱う（例：食品のコストコと日用品のコストコ） */
  subcategoryName: string | null;
  q: string;
}

/** メモのカテゴリの名前（絞り込み・さがすに使う） */
export interface MemoNames {
  category?: string;
  subcategory?: string;
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
  /** まだ買っていないものの数（消えていく途中のものは数えない） */
  count: number;
  groups: ListGroup[];
}

export const NO_CATEGORY = 'カテゴリなし';
export const NO_SUBCATEGORY = 'そのほか';
export const DONE_TITLE = '買ったもの';

/** 全角・半角や大文字・小文字の違いを気にせず探せるようにする */
export function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim();
}

/** 絞り込み（買ったかどうかは見ない）。names はそのメモの大カテゴリ・中カテゴリの名前 */
export function matchesFilter(m: Memo, f: Pick<ListFilter, 'categoryId' | 'subcategoryName' | 'q'>, names: MemoNames = {}): boolean {
  if (f.categoryId && m.categoryId !== f.categoryId) return false;
  if (f.subcategoryName && (!names.subcategory || norm(names.subcategory) !== norm(f.subcategoryName))) return false;
  const q = norm(f.q);
  if (q) {
    const words = q.split(/\s+/);
    // 名前・詳細メモ・リンクの表示名に加えて、カテゴリの名前でも探せる（「コストコ」で、コストコで買うものが出る）
    const hay = norm([m.title, m.body, ...m.links.map((l) => l.label), names.category ?? '', names.subcategory ?? ''].join('\n'));
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** 大カテゴリ・中カテゴリの ID から名前を引く */
export function memoNamesOf(categories: Category[]): (m: Memo) => MemoNames {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (m) => {
    const c = m.categoryId ? byId.get(m.categoryId) : undefined;
    return { category: c?.name, subcategory: c?.subcategories.find((s) => s.id === m.subcategoryId)?.name };
  };
}

/** 絞り込みに出す中カテゴリの名前（大カテゴリの並び順・中カテゴリの並び順で、同じ名前は1つにまとめる） */
export function subcategoryNames(categories: Category[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const c of categories) {
    for (const s of c.subcategories) {
      const key = norm(s.name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(s.name);
    }
  }
  return names;
}

/** 欲しいものは追加した新しい順、買ったものは買った新しい順 */
export function sortMemos(list: Memo[], done: boolean): Memo[] {
  const key = (m: Memo) => (done ? (m.doneAt ?? m.createdAt) : m.createdAt);
  return [...list].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
}

/** 今日（日本時間）買ったもの（履歴への入口の件数に使う） */
export function boughtToday(m: Memo, today: string): boolean {
  return m.doneAt !== null && dateJst(m.doneAt) === today;
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
 * 買ったものは出さない（履歴の画面で見る）。keep は、買ったばかりで横へ消えていく途中のメモ（アニメーションのあいだだけ元の場所に残す）
 */
export function buildSections(memos: Memo[], filter: ListFilter, mode: ViewMode, categories: Category[], keep: ReadonlySet<string> = new Set()): ListSection[] {
  const namesOf = memoNamesOf(categories);
  const shown = sortMemos(
    memos.filter((m) => (!m.doneAt || keep.has(m.id)) && matchesFilter(m, filter, namesOf(m))),
    false,
  );
  const section = (key: string, title: string | null, category: Category | null, groups: ListGroup[], list: Memo[]): ListSection => ({
    key,
    title,
    category,
    count: list.filter((m) => !m.doneAt).length,
    groups,
  });
  const sections: ListSection[] = [];
  if (mode === 'recent') {
    if (shown.length) sections.push(section('open', null, null, [{ key: 'open', title: null, memos: shown }], shown));
  } else {
    for (const c of categories) {
      const list = shown.filter((m) => m.categoryId === c.id);
      if (list.length) sections.push(section(`c:${c.id}`, c.name, c, bySubcategory(list, c), list));
    }
    const known = new Set(categories.map((c) => c.id));
    const rest = shown.filter((m) => !m.categoryId || !known.has(m.categoryId));
    if (rest.length) sections.push(section('c:none', NO_CATEGORY, null, [{ key: 'none', title: null, memos: rest }], rest));
  }
  return sections;
}

export interface BoughtDay {
  /** 日本時間の日付（YYYY-MM-DD） */
  date: string;
  memos: Memo[];
  /** 値段を入れたものの合計（1つも入っていなければ null） */
  total: number | null;
}

export interface BoughtFilter {
  /** 買った人（null ならみんな） */
  doneBy: string | null;
  categoryId: string | null;
  subcategoryName: string | null;
}

/** 買ったものの履歴：買った日（日本時間）ごとに、新しい日・新しい順に並べる */
export function boughtHistory(memos: Memo[], filter: BoughtFilter, categories: Category[]): BoughtDay[] {
  const namesOf = memoNamesOf(categories);
  const done = sortMemos(
    memos.filter((m) => m.doneAt && (!filter.doneBy || m.doneBy === filter.doneBy) && matchesFilter(m, { ...filter, q: '' }, namesOf(m))),
    true,
  );
  const days: BoughtDay[] = [];
  for (const m of done) {
    const date = dateJst(m.doneAt!);
    let day = days.at(-1);
    if (!day || day.date !== date) {
      day = { date, memos: [], total: null };
      days.push(day);
    }
    day.memos.push(m);
    if (m.price !== null) day.total = (day.total ?? 0) + m.price;
  }
  return days;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 履歴の日の見出し：「今日」「昨日」「10月15日（水）」（今年でなければ「2025年10月15日（水）」） */
export function dayLabel(date: string, today: string): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const w = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${y === Number(today.slice(0, 4)) ? '' : `${y}年`}${mo}月${d}日（${w}）`;
}
