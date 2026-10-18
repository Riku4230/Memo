import { readLocal, writeLocal } from './storage';

/** 端末ごとに覚えておく表示の設定 */

export type ViewMode = 'recent' | 'category';

const VIEW_KEY = 'memo:view';

export function loadViewMode(): ViewMode {
  const v = readLocal(VIEW_KEY);
  return v === 'category' ? v : 'recent';
}
export function saveViewMode(v: ViewMode): void {
  writeLocal(VIEW_KEY, v);
}

