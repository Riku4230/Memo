import { describe, expect, it } from 'vitest';
import type { Memo, Tag } from '../../shared/types';
import { buildSections, matchesFilter, NO_GENRE, NO_STORE } from './list';

const tag = (id: string, name: string, sortOrder: number): Tag => ({ id, name, icon: 'store', color: '#000000', sortOrder });
const stores = [tag('yodo', 'ヨドバシ', 0), tag('amzn', 'Amazon', 1)];
const genres = [tag('wash', '洗濯機', 0), tag('fridge', '冷蔵庫', 1)];

function memo(id: string, p: Partial<Memo> = {}): Memo {
  return {
    id,
    title: id,
    body: '',
    genreId: null,
    offers: [],
    links: [],
    doneAt: null,
    doneBy: null,
    createdBy: null,
    createdAt: `2026-10-0${id.length}T00:00:00.000Z`,
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...p,
  };
}
const offer = (storeId: string, price: number | null = null) => ({ storeId, price, url: '', note: '', checkedOn: null });
const all = { state: 'open' as const, storeId: null, genreId: null, q: '' };

describe('一覧の組み立て', () => {
  const memos = [
    memo('a', { genreId: 'wash', offers: [offer('yodo', 100), offer('amzn', 90)] }),
    memo('bb', { genreId: 'fridge', offers: [offer('yodo')] }),
    memo('ccc'),
    memo('dddd', { doneAt: '2026-10-05T00:00:00.000Z' }),
  ];

  it('新しい順は1列で、買ったものを含めない', () => {
    const s = buildSections(memos, all, 'recent', stores, genres);
    expect(s).toHaveLength(1);
    expect(s[0]!.groups[0]!.rows.map((r) => r.memo.id)).toEqual(['ccc', 'bb', 'a']);
  });

  it('購入先ごと：購入先が2つあるメモは両方に出て、購入先のないメモは最後', () => {
    const s = buildSections(memos, all, 'store', stores, genres);
    expect(s.map((x) => x.title)).toEqual(['ヨドバシ', 'Amazon', NO_STORE]);
    expect(s[0]!.groups.map((g) => g.title)).toEqual(['洗濯機', '冷蔵庫']);
    expect(s[1]!.groups[0]!.rows[0]).toMatchObject({ storeId: 'amzn' });
    expect(s[2]!.groups.map((g) => g.title)).toEqual([NO_GENRE]);
  });

  it('購入先で絞ると、その購入先の見出しだけ', () => {
    const s = buildSections(memos, { ...all, storeId: 'amzn' }, 'store', stores, genres);
    expect(s.map((x) => x.title)).toEqual(['Amazon']);
  });

  it('ジャンルごと：ジャンルのないメモは最後', () => {
    const s = buildSections(memos, all, 'genre', stores, genres);
    expect(s.map((x) => x.title)).toEqual(['洗濯機', '冷蔵庫', NO_GENRE]);
  });

  it('買ったものに切り替えると、買ったものだけ', () => {
    const s = buildSections(memos, { ...all, state: 'done' }, 'recent', stores, genres);
    expect(s[0]!.groups[0]!.rows.map((r) => r.memo.id)).toEqual(['dddd']);
  });

  it('キーワードは全角・半角、大文字・小文字を区別せず、名前・詳細メモ・ひとことから探す', () => {
    const m = memo('x', { title: 'ＳＨＡＲＰの冷蔵庫', body: '幅60cm', offers: [{ ...offer('yodo'), note: 'ポイント10%' }] });
    expect(matchesFilter(m, { ...all, q: 'sharp' })).toBe(true);
    expect(matchesFilter(m, { ...all, q: '60CM' })).toBe(true);
    expect(matchesFilter(m, { ...all, q: 'ポイント 冷蔵庫' })).toBe(true);
    expect(matchesFilter(m, { ...all, q: '洗濯機' })).toBe(false);
  });
});
