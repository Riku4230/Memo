// Kakeibo の src/client/components/Sheet.tsx から（Kakeibo 側で直したら合わせる）
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** 開いているシートの重なり順。Esc はいちばん上のシートだけに効かせる */
const stack: symbol[] = [];
/** 最初のシートを開く前の body のスクロール設定。最後のシートが閉じたときに戻す */
let savedOverflow = '';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** 中身の量で高さが変わらないよう、最大の高さで固定する（検索結果など） */
  tall?: boolean;
  actions?: ReactNode;
}

/** 下に払って閉じるときの、閉じたとみなす移動量（px）と速さ（px/ms） */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.6;

/** 指を置いた場所から下に払っても、シートを動かさない場所（中でスクロールしている部分・並び替えのつまみ・入力欄など） */
function blocksDrag(target: EventTarget | null, sheet: HTMLElement): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== sheet; el = el.parentElement) {
    if (el.matches('textarea, input[type="range"], select, [data-no-sheet-drag], .touch-none')) return true;
    if (el instanceof HTMLElement && el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * スマホのシートを、いちばん上までスクロールした状態で下に払うと閉じる（iPhone のシートと同じ操作）。
 * 少しだけ動かして離したときは元の位置に戻す
 */
function useSwipeToClose(sheetRef: React.RefObject<HTMLDivElement | null>, backdropRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !window.matchMedia('(max-width: 767px)').matches) return;
    let start: { x: number; y: number; t: number } | null = null;
    let dragging = false;
    let last = { y: 0, t: 0, v: 0 };
    const setOffset = (dy: number, animate: boolean) => {
      const transition = animate ? 'transform 0.2s ease, opacity 0.2s ease' : 'none';
      sheet.style.transition = transition;
      sheet.style.transform = dy ? `translateY(${dy}px)` : '';
      const backdrop = backdropRef.current;
      if (backdrop) {
        backdrop.style.transition = transition;
        backdrop.style.opacity = dy ? String(Math.max(0, 1 - dy / (sheet.offsetHeight || 1))) : '';
      }
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      // 中身が途中までスクロールされているときは、ふつうにスクロールさせる
      start = t && e.touches.length === 1 && sheet.scrollTop <= 0 && !blocksDrag(e.target, sheet) ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
      dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      if (!dragging) {
        // 横の動き（カテゴリの横スクロールなど）や上へのスクロールでは動かさない
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          start = null;
          return;
        }
        dragging = true;
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      e.preventDefault();
      const dt = Math.max(1, e.timeStamp - last.t);
      last = { y: dy, t: e.timeStamp, v: (dy - last.y) / dt };
      setOffset(Math.max(0, dy), false);
    };
    const onEnd = () => {
      if (!dragging) {
        start = null;
        return;
      }
      const dy = last.y;
      dragging = false;
      start = null;
      if (dy > DISMISS_DISTANCE || (dy > 30 && last.v > DISMISS_VELOCITY)) {
        setOffset(sheet.offsetHeight, true);
        window.setTimeout(() => onCloseRef.current(), 180);
      } else {
        setOffset(0, true);
      }
      last = { y: 0, t: 0, v: 0 };
    };
    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [sheetRef, backdropRef]);
}

/** スマホでは下から出るシート（下に払って閉じられる）、タブレット以上では中央のモーダルとして表示する（§2.2） */
export function Sheet({ title, onClose, children, wide, tall, actions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  useSwipeToClose(ref, backdropRef, onClose);
  // onClose は描画のたびに作り直されることがあるため、ref 経由で参照してフォーカス処理を1回だけ行う
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // 閉じたときにフォーカスを戻す先。autoFocus が効く前（最初の描画時）に覚えておく
  const prevFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const prev = prevFocus.current;
    const id = Symbol('sheet');
    stack.push(id);
    // autoFocus の入力欄がある場合はそちらを優先し、なければシート自体にフォーカスする
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    if (stack.length === 1) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      stack.splice(stack.indexOf(id), 1);
      document.removeEventListener('keydown', onKey);
      // 重なったシートが同時に閉じても、すべて閉じたときに一度だけ元に戻す
      if (stack.length === 0) document.body.style.overflow = savedOverflow;
      // 閉じると同時に別のシートを開いた（＋の選択から入力画面など）ときは、新しいシートのフォーカスを奪わない
      const active = document.activeElement;
      if (active && active !== document.body && active.closest('[role="dialog"]')) return;
      prev?.focus?.();
    };
  }, []);
  // 親のシートの中から開いても位置がずれないよう、body 直下に描画する
  return createPortal(
    <>
      <div ref={backdropRef} className="fixed inset-0 z-40 animate-fade-in bg-black/30" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={clsx(
          'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] animate-sheet-up overflow-y-auto rounded-t-xl border-t border-line bg-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] outline-none',
          'md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[86dvh] md:-translate-x-1/2 md:-translate-y-1/2 md:animate-pop-in md:rounded-xl md:border md:px-6 md:pt-5 md:pb-6 md:shadow-float',
          wide ? 'md:w-[min(920px,calc(100vw-48px))]' : 'md:w-[min(540px,calc(100vw-48px))]',
          tall && 'h-[90dvh] md:h-[86dvh]',
        )}
      >
        <div className="mx-auto mt-1 mb-3 h-1.5 w-10 rounded-full bg-line md:hidden" />
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <div className="flex items-center gap-1">
            {actions}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="閉じる">
              <X className="size-5" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
