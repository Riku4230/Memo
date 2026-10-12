// Kakeibo の src/client/lib/dayMarks.ts の色の計算から（Kakeibo 側で直したら合わせる）

/** グラデーションから作る色の鮮やかさ（%）。色合いと明るさだけを選んでもらう */
export const MIX_SATURATION = 80;

/** 色合い（0〜360）・明るさ（0〜100）から #rrggbb を作る */
export function hslToHex(h: number, l: number, s = MIX_SATURATION): string {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** #rrggbb から、グラデーションのつまみの位置（色合い 0〜359・明るさ 0〜100）を求める */
export function hexToHueLight(hex: string): { hue: number; light: number } {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = ((max + min) / 2) * 100;
  const d = max - min;
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { hue: Math.round(hue), light: Math.round(light) };
}
