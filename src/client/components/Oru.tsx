// Kakeibo の src/client/components/Oru.tsx から（Kakeibo 側で直したら合わせる）
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

/** キャラクター「おる」の名前（吹き出しや読み上げで使う） */
export const ORU_NAME = 'おる';

// public/mascot/oru-sheet.webp の並び（scripts/build-mascot.mjs で作る）：横8列、1コマ 144×156
const SHEET = '/mascot/oru-sheet.webp';
const COLS = 8;
const ROWS = 8;
const FRAME_W = 144;
const FRAME_H = 156;
/** 1コマの長さ（元の GIF と同じ） */
const FRAME_MS = 160;

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** 動きごとに使うコマ（元の GIF のコマ番号） */
export const ORU_ANIMS = {
  idle: range(0, 5),
  walkRight: range(6, 13),
  walkLeft: range(14, 21),
  wave: range(22, 27),
  jump: [28, 29, 28, 29],
  sad: range(31, 35),
  talk: range(38, 47),
  think: range(48, 56),
} as const;
export type OruAnim = keyof typeof ORU_ANIMS;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * おるの絵。選んだ動きのコマを順に切り替えて動かす（1枚の画像の表示位置をずらすだけなので軽い）。
 * 「視差効果を減らす」の端末では動かさず、最初のコマだけを出す
 */
export function Oru({ anim = 'idle', size = 72, className }: { anim?: OruAnim; size?: number; className?: string }) {
  const frames = ORU_ANIMS[anim];
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => setStep((s) => s + 1), FRAME_MS);
    return () => window.clearInterval(id);
  }, [anim]);
  const frame = frames[step % frames.length]!;
  const h = Math.round((size * FRAME_H) / FRAME_W);
  return (
    <span
      className={clsx('oru inline-block shrink-0 bg-no-repeat', className)}
      data-anim={anim}
      aria-hidden="true"
      style={{
        width: size,
        height: h,
        backgroundImage: `url(${SHEET})`,
        backgroundSize: `${COLS * size}px ${ROWS * h}px`,
        backgroundPosition: `-${(frame % COLS) * size}px -${Math.floor(frame / COLS) * h}px`,
      }}
    />
  );
}

/** 1文字ずつ出していく文字（おるがしゃべっているように見せる）。出し終わったら onDone を呼ぶ */
export function useTyping(text: string, onDone?: () => void, speedMs = 55): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setN(text.length);
      onDone?.();
      return;
    }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setN(i);
      if (i >= text.length) {
        window.clearInterval(id);
        onDone?.();
      }
    }, speedMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return [...text].slice(0, n).join('');
}

/** 吹き出し。tail でしっぽの向きを決める（おるのいる側） */
export function SpeechBubble({
  text,
  tail = 'left',
  onDone,
  onClose,
  className,
}: {
  text: string;
  tail?: 'left' | 'right' | 'bottom';
  onDone?: () => void;
  /** あれば右上に ✕ を出し、押すと閉じる */
  onClose?: () => void;
  className?: string;
}) {
  const shown = useTyping(text, onDone);
  return (
    <span
      className={clsx(
        'oru-bubble relative inline-block rounded-2xl border border-line bg-surface px-3.5 py-2 text-sm leading-snug font-medium text-ink shadow-float',
        tail === 'left' && 'rounded-bl-md',
        tail === 'right' && 'rounded-br-md',
        onClose && 'pr-8',
        className,
      )}
    >
      {onClose && (
        <button type="button" className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2" aria-label="ひとことを閉じる" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      )}
      {/* 読み上げでは、打ち終わった文をまとめて読む */}
      <span aria-hidden="true">
        {shown}
        {shown.length < text.length && <span className="opacity-0">{text.slice(shown.length)}</span>}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
