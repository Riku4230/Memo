import { describe, expect, it } from 'vitest';
import type { Category, Memo } from '../../shared/types';
import { boughtHistory, buildSections, dayLabel, matchesFilter, NO_CATEGORY, NO_SUBCATEGORY, subcategoryNames, type ListFilter } from './list';

const categories: Category[] = [
  { id: 'hundred', name: '100均', icon: 'store', color: '#000000', sortOrder: 0, subcategories: [{ id: 'daiso', name: 'ダイソー', sortOrder: 0 }, { id: 'seria', name: 'セリア', sortOrder: 1 }] },
  { id: 'daily', name: '日用品', icon: 'store', color: '#000000', sortOrder: 1, subcategories: [] },
];

function memo(id: string, p: Partial<Memo> = {}): Memo {
  return {
    id,
    title: id,
    body: '',
    categoryId: null,
    subcategoryId: null,
    price: null,
    links: [],
    doneAt: null,
    doneBy: null,
    createdBy: null,
    createdAt: `2026-10-0${id.length}T00:00:00.000Z`,
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...p,
  };
}
const all: ListFilter = { categoryId: null, subcategoryName: null, q: '' };
/** テストの「今日」（日本時間） */
const TODAY = '2026-10-18';

describe('一覧の組み立て', () => {
  const memos = [
    memo('a', { categoryId: 'hundred', subcategoryId: 'seria' }),
    memo('bb', { categoryId: 'hundred', subcategoryId: 'daiso' }),
    memo('ccc', { categoryId: 'hundred' }),
    memo('dddd', { categoryId: 'daily' }),
    memo('eeeee'),
    memo('ffffff', { categoryId: 'daily', doneAt: '2026-10-09T00:00:00.000Z' }),
  ];
  const build = (f: ListFilter, mode: 'recent' | 'category', list = memos, keep?: Set<string>) => buildSections(list, f, mode, categories, keep);

  it('新しい順は1列で、買ったものは出さない', () => {
    const s = build(all, 'recent');
    expect(s).toHaveLength(1);
    expect(s[0]!.groups[0]!.memos.map((m) => m.id)).toEqual(['eeeee', 'dddd', 'ccc', 'bb', 'a']);
  });

  it('カテゴリごと：大カテゴリの並び順、中で中カテゴリの並び順、中カテゴリなしは「そのほか」、大カテゴリなしは最後', () => {
    const s = build(all, 'category');
    expect(s.map((x) => x.title)).toEqual(['100均', '日用品', NO_CATEGORY]);
    expect(s[0]!.groups.map((g) => g.title)).toEqual(['ダイソー', 'セリア', NO_SUBCATEGORY]);
    // 中カテゴリを1つも使っていない大カテゴリは小見出しなし
    expect(s[1]!.groups.map((g) => g.title)).toEqual([null]);
  });

  it('買ったばかりで消えていく途中のメモは、元の場所に残すが件数には数えない', () => {
    const s = build(all, 'category', memos, new Set(['ffffff']));
    const daily = s.find((x) => x.title === '日用品')!;
    expect(daily.groups[0]!.memos.map((m) => m.id)).toEqual(['ffffff', 'dddd']);
    expect(daily.count).toBe(1);
  });

  it('大カテゴリで絞り込める', () => {
    const s = build({ ...all, categoryId: 'daily' }, 'recent');
    expect(s.map((x) => x.groups[0]!.memos.map((m) => m.id))).toEqual([['dddd']]);
  });

  it('キーワードは全角・半角、大文字・小文字を区別せず、名前・詳細メモ・リンクの表示名から探す', () => {
    const m = memo('x', { title: 'ＳＨＡＲＰの冷蔵庫', body: '幅60cm', links: [{ url: 'https://example.com', label: '比較記事' }] });
    expect(matchesFilter(m, { categoryId: null, subcategoryName: null, q: 'sharp' })).toBe(true);
    expect(matchesFilter(m, { categoryId: null, subcategoryName: null, q: '60CM' })).toBe(true);
    expect(matchesFilter(m, { categoryId: null, subcategoryName: null, q: '比較 冷蔵庫' })).toBe(true);
    expect(matchesFilter(m, { categoryId: null, subcategoryName: null, q: '洗濯機' })).toBe(false);
  });

  describe('中カテゴリの名前で絞り込む', () => {
    const cats: Category[] = [
      { id: 'food', name: '食品', icon: 'store', color: '#000000', sortOrder: 0, subcategories: [{ id: 'food-costco', name: 'コストコ', sortOrder: 0 }, { id: 'super', name: 'スーパー', sortOrder: 1 }] },
      { id: 'daily', name: '日用品', icon: 'store', color: '#000000', sortOrder: 1, subcategories: [{ id: 'daily-costco', name: 'ｺｽﾄｺ', sortOrder: 0 }] },
      { id: 'hundred', name: '100均', icon: 'store', color: '#000000', sortOrder: 2, subcategories: [{ id: 'daiso', name: 'ダイソー', sortOrder: 0 }] },
    ];
    const list = [
      memo('meat', { title: '肉', categoryId: 'food', subcategoryId: 'food-costco' }),
      memo('milk', { title: '牛乳', categoryId: 'food', subcategoryId: 'super' }),
      memo('paper', { title: 'トイレットペーパー', categoryId: 'daily', subcategoryId: 'daily-costco' }),
      memo('stand', { title: 'スタンド', categoryId: 'hundred', subcategoryId: 'daiso' }),
      memo('none', { title: 'カテゴリなし' }),
    ];
    const ids = (f: Partial<ListFilter>) => buildSections(list, { ...all, ...f }, 'recent', cats).flatMap((s) => s.groups.flatMap((g) => g.memos.map((m) => m.id))).sort();

    it('同じ名前の中カテゴリは、大カテゴリをまたいでまとめて出す（全角・半角の違いは同じとみなす）', () => {
      expect(ids({ subcategoryName: 'コストコ' })).toEqual(['meat', 'paper']);
      expect(ids({ subcategoryName: 'ダイソー' })).toEqual(['stand']);
    });

    it('大カテゴリで絞ると、中の中カテゴリのものも全部出す', () => {
      expect(ids({ categoryId: 'food' })).toEqual(['meat', 'milk']);
    });

    it('さがすでは、大カテゴリ・中カテゴリの名前でも見つかる', () => {
      expect(ids({ q: 'コストコ' })).toEqual(['meat', 'paper']);
      expect(ids({ q: '100均' })).toEqual(['stand']);
    });

    it('絞り込みに出す中カテゴリの名前は、並び順のまま同じ名前を1つにまとめる', () => {
      expect(subcategoryNames(cats)).toEqual(['コストコ', 'スーパー', 'ダイソー']);
    });
  });
});

describe('買ったものの履歴', () => {
  const cats: Category[] = [{ id: 'food', name: '食品', icon: 'store', color: '#000000', sortOrder: 0, subcategories: [{ id: 'costco', name: 'コストコ', sortOrder: 0 }] }];
  const list = [
    memo('bread', { categoryId: 'food', subcategoryId: 'costco', price: 598, doneBy: 'riku', doneAt: '2026-10-15T03:00:00.000Z' }),
    memo('attack', { categoryId: 'food', subcategoryId: 'costco', price: 1880, doneBy: 'riku', doneAt: '2026-10-15T05:00:00.000Z' }),
    memo('rinse', { doneBy: 'eri', doneAt: '2026-10-16T20:00:00.000Z' }),
    memo('open'),
  ];
  const none = { doneBy: null, categoryId: null, subcategoryName: null };

  it('日本時間の日付ごとに、新しい日・新しい順にまとめ、値段の合計を出す', () => {
    const days = boughtHistory(list, none, cats);
    expect(days.map((d) => d.date)).toEqual(['2026-10-17', '2026-10-15']);
    expect(days[1]!.memos.map((m) => m.id)).toEqual(['attack', 'bread']);
    expect(days[1]!.total).toBe(2478);
    // 値段が1つも入っていない日は合計なし
    expect(days[0]!.total).toBeNull();
  });

  it('買った人・カテゴリで絞り込める', () => {
    expect(boughtHistory(list, { ...none, doneBy: 'eri' }, cats).flatMap((d) => d.memos.map((m) => m.id))).toEqual(['rinse']);
    expect(boughtHistory(list, { ...none, subcategoryName: 'コストコ' }, cats).flatMap((d) => d.memos.map((m) => m.id))).toEqual(['attack', 'bread']);
  });

  it('日の見出しは今日・昨日・日付（曜日つき、今年でなければ年も）', () => {
    expect(dayLabel('2026-10-18', TODAY)).toBe('今日');
    expect(dayLabel('2026-10-17', TODAY)).toBe('昨日');
    expect(dayLabel('2026-10-15', TODAY)).toBe('10月15日（木）');
    expect(dayLabel('2025-12-31', TODAY)).toBe('2025年12月31日（水）');
  });
});
