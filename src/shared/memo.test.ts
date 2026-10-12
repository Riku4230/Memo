import { describe, expect, it } from 'vitest';
import { cheapestPrice, sortOffers } from './memo';

describe('値段の比べ方', () => {
  it('安い順に並べ、値段のない候補は後ろ', () => {
    const list = [{ price: null }, { price: 300 }, { price: 100 }, { price: 300 }];
    expect(sortOffers(list)).toEqual([list[2], list[1], list[3], list[0]]);
    expect(cheapestPrice(list)).toBe(100);
    expect(cheapestPrice([{ price: null }])).toBeNull();
  });
});
