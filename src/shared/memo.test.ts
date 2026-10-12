import { describe, expect, it } from 'vitest';
import { cheapestPrice, isStale, sortOffers } from './memo';

describe('値段の比べ方', () => {
  it('安い順に並べ、値段のない候補は後ろ', () => {
    const list = [{ price: null }, { price: 300 }, { price: 100 }, { price: 300 }];
    expect(sortOffers(list)).toEqual([list[2], list[1], list[3], list[0]]);
    expect(cheapestPrice(list)).toBe(100);
    expect(cheapestPrice([{ price: null }])).toBeNull();
  });

  it('確かめてから30日たった値段は古い', () => {
    expect(isStale({ price: 1, checkedOn: '2026-09-12' }, '2026-10-12')).toBe(true);
    expect(isStale({ price: 1, checkedOn: '2026-09-13' }, '2026-10-12')).toBe(false);
    expect(isStale({ price: null, checkedOn: '2026-01-01' }, '2026-10-12')).toBe(false);
    expect(isStale({ price: 1, checkedOn: null }, '2026-10-12')).toBe(false);
  });
});
