import { readLocal, writeLocal } from './storage';

/** 端末ごとに覚えておく表示の設定 */

export type ViewMode = 'recent' | 'category';

const VIEW_KEY = 'memo:view';
const LAST_KEY = 'memo:last-category';
const DONE_KEY = 'memo:show-done';

export function loadViewMode(): ViewMode {
  const v = readLocal(VIEW_KEY);
  return v === 'category' ? v : 'recent';
}
export function saveViewMode(v: ViewMode): void {
  writeLocal(VIEW_KEY, v);
}

/** 買ったものも一覧に出すか（左上の丸。端末ごと） */
export function loadShowDone(): boolean {
  return readLocal(DONE_KEY) === 'on';
}
export function saveShowDone(on: boolean): void {
  writeLocal(DONE_KEY, on ? 'on' : 'off');
}

/** すぐ登録で前に選んだ大カテゴリ・中カテゴリ（次の入力でも選んだ状態にする） */
export interface LastCategory {
  categoryId: string | null;
  subcategoryId: string | null;
}
export function loadLastCategory(): LastCategory {
  try {
    const v = JSON.parse(readLocal(LAST_KEY) ?? '{}') as Partial<LastCategory>;
    return {
      categoryId: typeof v.categoryId === 'string' ? v.categoryId : null,
      subcategoryId: typeof v.subcategoryId === 'string' ? v.subcategoryId : null,
    };
  } catch {
    return { categoryId: null, subcategoryId: null };
  }
}
export function saveLastCategory(v: LastCategory): void {
  writeLocal(LAST_KEY, JSON.stringify(v));
}
