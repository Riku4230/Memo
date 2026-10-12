// Kakeibo の src/client/lib/theme.ts から（Kakeibo 側で直したら合わせる）
import { readLocal, writeLocal } from './storage';

/** 画面の明るさ。system は端末の設定に合わせる（public/theme.js が実際の切り替えを行う） */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'memo-theme';

export function themeChoice(): ThemeChoice {
  const v = readLocal(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function setThemeChoice(choice: ThemeChoice): void {
  if (choice === 'system') {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // 保存できない環境では、端末の設定に合わせた表示のまま
    }
  } else {
    writeLocal(KEY, choice);
  }
  window.dispatchEvent(new Event('memo-theme-change'));
}
