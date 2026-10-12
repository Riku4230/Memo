import clsx from 'clsx';
import { Check } from 'lucide-react';

/**
 * 「買った」のチェックボックス。押せる範囲は 44px 四方、見た目は丸。
 * 押すとすぐ保存する（保存ボタンは不要）
 */
export function DoneCheck({ done, title, onChange, size = 'md' }: { done: boolean; title: string; onChange: (done: boolean) => void; size?: 'md' | 'lg' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`「${title}」を買った`}
      className="done-check -m-1.5 flex size-11 shrink-0 items-center justify-center rounded-full"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!done);
      }}
    >
      <span
        className={clsx(
          'flex items-center justify-center rounded-full border-2 transition duration-200',
          size === 'lg' ? 'size-7' : 'size-6',
          done ? 'check-pop border-brand-strong bg-brand-strong text-white' : 'border-ink-3/60 bg-surface hover:border-brand',
        )}
      >
        {done && <Check className="size-4 stroke-[3]" />}
      </span>
    </button>
  );
}
