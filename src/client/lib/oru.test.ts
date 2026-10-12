import { describe, expect, it } from 'vitest';
import { factLines, pickOruLine } from './oru';

describe('おるのひとこと', () => {
  const facts = {
    openCount: 5,
    topStore: { name: 'ヨドバシ', count: 3 },
    oldest: { title: '電気ケトル', days: 45 },
    cheapest: { title: '洗濯機', store: 'Amazon', diff: 10800 },
  };

  it('メモの数字から言えることを作る', () => {
    const texts = factLines(facts).map((l) => l.text);
    expect(texts).toContain('欲しいものが5件あるよ');
    expect(texts).toContain('ヨドバシで買うものが3件あるよ。今度まとめて行こう');
    expect(texts).toContain('「電気ケトル」、45日前のメモだよ。まだ欲しい？');
    expect(texts).toContain('「洗濯機」はAmazonがいちばん安いよ（10,800円の差）');
  });

  it('購入先のメモが1件だけなら、まとめて行こうとは言わない', () => {
    const texts = factLines({ ...facts, topStore: { name: 'IKEA', count: 1 }, oldest: null, cheapest: null }).map((l) => l.text);
    expect(texts).toEqual(['欲しいものが5件あるよ']);
  });

  it('数字のひとことと普通のひとことを混ぜる', () => {
    expect(factLines(facts).map((l) => l.text)).toContain(pickOruLine(facts, () => 0, 12).text);
    expect(pickOruLine(null, () => 0, 12).text).toBe('欲しいもの、思いついた？');
  });
});
