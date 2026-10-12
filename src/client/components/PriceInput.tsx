import { useLayoutEffect, useRef } from 'react';
import { MAX_PRICE } from '../../shared/schemas';

/** 入力文字列を「円の整数の数字列」にする。全角数字は半角に、小数点以下は切り捨てる（Kakeibo の AmountInput から） */
export function toDigits(input: string): string {
  const half = input.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  const integerPart = half.split(/[.．]/)[0] ?? '';
  return integerPart.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, String(MAX_PRICE).length);
}

interface Props {
  id?: string;
  value: string;
  onChange: (digits: string) => void;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}

/** 数字のみ受け付け、カンマ区切りで表示する値段の入力。スマホではテンキーが出る。空なら「値段なし」 */
export function PriceInput({ id, value, onChange, className = 'input text-right', ariaLabel, autoFocus }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  /** 書式を付け直した後に、カーソルを「左から何桁目の数字の後ろ」に戻すか */
  const caretDigits = useRef<number | null>(null);
  const display = value ? Number(value).toLocaleString('ja-JP') : '';

  useLayoutEffect(() => {
    const el = ref.current;
    const n = caretDigits.current;
    if (!el || n === null || document.activeElement !== el) return;
    caretDigits.current = null;
    let pos = 0;
    let seen = 0;
    while (pos < display.length && seen < n) {
      if (/\d/.test(display[pos]!)) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }, [display]);

  return (
    <div className="relative">
      <input
        ref={ref}
        id={id}
        className={`${className} pr-8`}
        inputMode="numeric"
        autoComplete="off"
        placeholder="—"
        value={display}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        onChange={(e) => {
          const raw = e.target.value;
          const caret = e.target.selectionStart ?? raw.length;
          caretDigits.current = toDigits(raw.slice(0, caret)).length;
          const digits = toDigits(raw);
          onChange(Number(digits) > MAX_PRICE ? String(MAX_PRICE) : digits);
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-3">円</span>
    </div>
  );
}
