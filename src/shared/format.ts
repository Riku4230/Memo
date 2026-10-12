// Kakeibo の src/shared/format.ts から（Kakeibo 側で直したら合わせる）
export function yen(n: number): string {
  return n.toLocaleString('ja-JP');
}

/** カレンダーのセル用。5桁以上は「1.2万」のように短縮する */
export function yenShort(n: number): string {
  if (n < 10_000) return n.toLocaleString('ja-JP');
  const man = n / 10_000;
  return `${man >= 100 ? Math.round(man) : Math.round(man * 10) / 10}万`;
}
