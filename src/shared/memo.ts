import type { Offer } from './types';

/** 候補を値段の安い順に並べる（値段のない候補は後ろ。同じ値段なら元の順） */
export function sortOffers<T extends Pick<Offer, 'price'>>(offers: T[]): T[] {
  return offers
    .map((o, i) => ({ o, i }))
    .sort((a, b) => {
      if (a.o.price === null && b.o.price === null) return a.i - b.i;
      if (a.o.price === null) return 1;
      if (b.o.price === null) return -1;
      return a.o.price - b.o.price || a.i - b.i;
    })
    .map((x) => x.o);
}

/** いちばん安い値段（値段のある候補がなければ null） */
export function cheapestPrice(offers: Pick<Offer, 'price'>[]): number | null {
  let min: number | null = null;
  for (const o of offers) if (o.price !== null && (min === null || o.price < min)) min = o.price;
  return min;
}

