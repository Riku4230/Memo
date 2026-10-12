import { describe, expect, it } from 'vitest';
import { factLines, pickOruLine } from './oru';

describe('おるのひとこと', () => {
  const facts = {
    openCount: 5,
    topPlace: { name: 'ダイソー', count: 3 },
    oldest: { title: '電気ケトル', days: 45 },
  };

  it('メモの数字から言えることを作る', () => {
    const texts = factLines(facts).map((l) => l.text);
    expect(texts).toContain('欲しいものが5件あるよ');
    expect(texts).toContain('ダイソーのメモが3件あるよ。今度まとめて買おう');
    expect(texts).toContain('「電気ケトル」、45日前のメモだよ。まだ欲しい？');
  });

  it('同じところのメモが1件だけなら、まとめて買おうとは言わない', () => {
    const texts = factLines({ ...facts, topPlace: { name: 'IKEA', count: 1 }, oldest: null }).map((l) => l.text);
    expect(texts).toEqual(['欲しいものが5件あるよ']);
  });

  it('数字のひとことと普通のひとことを混ぜる', () => {
    expect(factLines(facts).map((l) => l.text)).toContain(pickOruLine(facts, () => 0, 12).text);
    expect(pickOruLine(null, () => 0, 12).text).toBe('欲しいもの、思いついた？');
  });
});
