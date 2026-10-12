// Kakeibo の src/client/lib/storage.ts から（Kakeibo 側で直したら合わせる）
/** localStorage は使えない環境（プライベートモード等）があるため、失敗しても動くようにする */
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 保存できなくても動作に影響しない
  }
}
