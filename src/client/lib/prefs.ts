import { readLocal, writeLocal } from './storage';

/** 端末ごとに覚えておく表示の設定 */

export type ViewMode = 'recent' | 'store' | 'genre';

const VIEW_KEY = 'memo:view';
const LAST_KEY = 'memo:last-tags';

export function loadViewMode(): ViewMode {
  const v = readLocal(VIEW_KEY);
  return v === 'store' || v === 'genre' ? v : 'recent';
}
export function saveViewMode(v: ViewMode): void {
  writeLocal(VIEW_KEY, v);
}

/** すぐ登録で前に選んだジャンル・購入先（次の入力でも選んだ状態にする） */
export interface LastTags {
  genreId: string | null;
  storeIds: string[];
}
export function loadLastTags(): LastTags {
  try {
    const v = JSON.parse(readLocal(LAST_KEY) ?? '{}') as Partial<LastTags>;
    return {
      genreId: typeof v.genreId === 'string' ? v.genreId : null,
      storeIds: Array.isArray(v.storeIds) ? v.storeIds.filter((s): s is string => typeof s === 'string') : [],
    };
  } catch {
    return { genreId: null, storeIds: [] };
  }
}
export function saveLastTags(v: LastTags): void {
  writeLocal(LAST_KEY, JSON.stringify(v));
}
