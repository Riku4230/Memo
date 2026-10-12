import { readLocal, writeLocal } from './storage';

/** 端末ごとに覚えておく表示の設定 */

export type ViewMode = 'recent' | 'category';

const VIEW_KEY = 'memo:view';
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
