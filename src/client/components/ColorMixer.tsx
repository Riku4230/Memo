// Kakeibo の src/client/components/ColorMixer.tsx から（Kakeibo 側で直したら合わせる）
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { hexToHueLight, hslToHex } from '../lib/color';

/** 明るさの範囲（上がいちばん明るく、下がいちばん暗い）。白・黒に近すぎると背景と見分けにくいので端は使わない */
const LIGHT_MAX = 85;
const LIGHT_MIN = 25;

interface Props {
  /** 最初のつまみの位置にする色（#rrggbb） */
  initial?: string;
  /** つまみを動かすたびに、できた色（#rrggbb）を知らせる */
  onChange: (color: string) => void;
}

/**
 * 四角の中を指でなぞって色を作る（横が色合い、縦が明るさ。日付の色・カテゴリの色で共通）。
 * キーボードでは ←→ で色合い、↑↓ で明るさを変える
 */
export function ColorMixer({ initial, onChange }: Props) {
  const start = initial ? hexToHueLight(initial) : { hue: 280, light: 55 };
  const [hue, setHue] = useState(start.hue);
  const [light, setLight] = useState(Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, start.light)));
  const pad = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const color = hslToHex(hue, light);

  // 四角の中身は、実際にできる色そのものを描く（見た目と選ばれる色がずれないように）
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const w = el.width;
    const h = el.height;
    const step = 2;
    for (let x = 0; x < w; x += step) {
      for (let y = 0; y < h; y += step) {
        ctx.fillStyle = hslToHex((x / w) * 360, LIGHT_MAX - (y / h) * (LIGHT_MAX - LIGHT_MIN));
        ctx.fillRect(x, y, step, step);
      }
    }
  }, []);

  const update = (h: number, l: number) => {
    const nh = Math.round(Math.min(359, Math.max(0, h)));
    const nl = Math.round(Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, l)));
    setHue(nh);
    setLight(nl);
    onChange(hslToHex(nh, nl));
  };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = pad.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    update(x * 360, LIGHT_MAX - y * (LIGHT_MAX - LIGHT_MIN));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 3], ArrowDown: [0, -3] }[e.key];
    if (!d) return;
    e.preventDefault();
    update(hue + d[0]!, light + d[1]!);
  };

  return (
    <div className="flex items-center gap-3">
      <span className="size-11 shrink-0 rounded-full border border-line" style={{ backgroundColor: color }} aria-hidden="true" />
      <div
        ref={pad}
        className="color-pad relative h-36 min-w-0 flex-1 cursor-crosshair touch-none rounded-xl"
        role="slider"
        tabIndex={0}
        aria-label="色を選ぶ（横で色合い、縦で明るさ）"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={hue}
        aria-valuetext={color}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e)}
        onKeyDown={onKey}
      >
        <canvas ref={canvas} width={360} height={144} className="absolute inset-0 size-full rounded-xl border border-line" aria-hidden="true" />
        <span
          className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.25),0_1px_4px_rgb(0_0_0/0.3)]"
          style={{ left: `${(hue / 360) * 100}%`, top: `${((LIGHT_MAX - light) / (LIGHT_MAX - LIGHT_MIN)) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
