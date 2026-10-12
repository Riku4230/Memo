import { describe, expect, it } from 'vitest';
import type { Category, Memo } from '../../shared/types';
import { buildSections, DONE_TITLE, matchesFilter, NO_CATEGORY, NO_SUBCATEGORY } from './list';

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
    links: [],
    doneAt: null,
    doneBy: null,
    createdBy: null,
    createdAt: `2026-10-0${id.length}T00:00:00.000Z`,
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...p,
  };
}
const all = { showDone: false, categoryId: null, q: '' };

describe('一覧の組み立て', () => {
  const memos = [
    memo('a', { categoryId: 'hundred', subcategoryId: 'seria' }),
    memo('bb', { categoryId: 'hundred', subcategoryId: 'daiso' }),
    memo('ccc', { categoryId: 'hundred' }),
    memo('dddd', { categoryId: 'daily' }),
    memo('eeeee'),
    memo('ffffff', { categoryId: 'daily', doneAt: '2026-10-09T00:00:00.000Z' }),
  ];

  it('新しい順は1列で、買ったものは出さない', () => {
    const s = buildSections(memos, all, 'recent', categories);
    expect(s).toHaveLength(1);
    expect(s[0]!.groups[0]!.memos.map((m) => m.id)).toEqual(['eeeee', 'dddd', 'ccc', 'bb', 'a']);
  });

  it('カテゴリごと：大カテゴリの並び順、中で中カテゴリの並び順、中カテゴリなしは「そのほか」、大カテゴリなしは最後', () => {
    const s = buildSections(memos, all, 'category', categories);
    expect(s.map((x) => x.title)).toEqual(['100均', '日用品', NO_CATEGORY]);
    expect(s[0]!.groups.map((g) => g.title)).toEqual(['ダイソー', 'セリア', NO_SUBCATEGORY]);
    // 中カテゴリを1つも使っていない大カテゴリは小見出しなし
    expect(s[1]!.groups.map((g) => g.title)).toEqual([null]);
  });

  it('買ったものも出すと、いちばん下にまとめる', () => {
    const s = buildSections(memos, { ...all, showDone: true }, 'category', categories);
    expect(s.at(-1)).toMatchObject({ title: DONE_TITLE, done: true, count: 1 });
    expect(s.at(-1)!.groups[0]!.memos.map((m) => m.id)).toEqual(['ffffff']);
  });

  it('大カテゴリで絞り込める', () => {
    const s = buildSections(memos, { ...all, categoryId: 'daily', showDone: true }, 'recent', categories);
    expect(s.map((x) => x.groups[0]!.memos.map((m) => m.id))).toEqual([['dddd'], ['ffffff']]);
  });

  it('キーワードは全角・半角、大文字・小文字を区別せず、名前・詳細メモ・リンクの表示名から探す', () => {
    const m = memo('x', { title: 'ＳＨＡＲＰの冷蔵庫', body: '幅60cm', links: [{ url: 'https://example.com', label: '比較記事' }] });
    expect(matchesFilter(m, { categoryId: null, q: 'sharp' })).toBe(true);
    expect(matchesFilter(m, { categoryId: null, q: '60CM' })).toBe(true);
    expect(matchesFilter(m, { categoryId: null, q: '比較 冷蔵庫' })).toBe(true);
    expect(matchesFilter(m, { categoryId: null, q: '洗濯機' })).toBe(false);
  });
});
