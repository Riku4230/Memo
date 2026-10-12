// Kakeibo の src/client/lib/flip.ts から（Kakeibo 側で直したら合わせる）
import { useLayoutEffect, useRef, type MutableRefObject } from 'react';

/**
 * 並び順が変わったとき、行が前の位置から新しい位置へすっと動くようにする（FLIP アニメーション）。
 * rowRefs は ID → 行の要素、key は並び順（ID をつないだ文字列など）
 */
export function useFlip<T extends HTMLElement>(rowRefs: MutableRefObject<Map<string, T>>, key: string): void {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const now = new Map<string, number>();
    for (const [id, el] of rowRefs.current) now.set(id, el.getBoundingClientRect().top);
    if (!reduce) {
      for (const [id, el] of rowRefs.current) {
        const before = last.current.get(id);
        const after = now.get(id);
        if (before === undefined || after === undefined || Math.abs(before - after) < 1) continue;
        el.style.transition = 'none';
        el.style.transform = `translateY(${before - after}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 160ms ease-out';
          el.style.transform = '';
        });
      }
    }
    last.current = now;
  }, [key, rowRefs]);
}

/** 動いている途中（useFlip の translateY がかかっている）でも、行の本来の上端と高さを返す（指の位置との比較に使う） */
export function restingRect(el: HTMLElement): { top: number; height: number } {
  const r = el.getBoundingClientRect();
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
  return { top: r.top - m.m42, height: r.height };
}
