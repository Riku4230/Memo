import type { Offer } from './types';
import { daysBetween } from './date';

/** 値段を確かめてから何日たったら「値段が古いかも」と出すか */
export const STALE_DAYS = 30;

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

/** 値段を確かめた日から STALE_DAYS 日以上たっているか（値段がない・日付がないなら古いとは言わない） */
export function isStale(offer: Pick<Offer, 'price' | 'checkedOn'>, today: string): boolean {
  return offer.price !== null && offer.checkedOn !== null && daysBetween(offer.checkedOn, today) >= STALE_DAYS;
}
