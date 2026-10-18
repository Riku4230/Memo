import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Category } from '../../shared/types';

/** Notion の表示切り替えのような、文字だけの選択欄（iPhone では下からの選択肢が出る） */
export function ChipSelect({ label, value, active, onChange, children }: { label: string; value: string; active: boolean; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <span className="relative shrink-0">
      <select
        className={clsx('view-select', active && 'font-semibold text-ink')}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-ink-3" />
    </span>
  );
}

export interface CategoryFilterValue {
  categoryId: string | null;
  subcategoryName: string | null;
}

/** カテゴリの絞り込み：大カテゴリで絞る（中のもの全部）か、中カテゴリの名前で絞る（同じ名前なら大カテゴリをまたいでまとめて出す） */
export function CategoryFilterSelect({ value, onChange, categories, subNames }: { value: CategoryFilterValue; onChange: (v: CategoryFilterValue) => void; categories: Category[]; subNames: string[] }) {
  const v = value.categoryId ? `c:${value.categoryId}` : value.subcategoryName ? `s:${value.subcategoryName}` : '';
  return (
    <ChipSelect
      label="カテゴリで絞り込む"
      value={v}
      active={v !== ''}
      onChange={(next) =>
        onChange({
          categoryId: next.startsWith('c:') ? next.slice(2) : null,
          subcategoryName: next.startsWith('s:') ? next.slice(2) : null,
        })
      }
    >
      <option value="">カテゴリ：すべて</option>
      <optgroup label="大カテゴリ">
        {categories.map((c) => (
          <option key={c.id} value={`c:${c.id}`}>
            {c.name}
          </option>
        ))}
      </optgroup>
      {subNames.length > 0 && (
        <optgroup label="中カテゴリ">
          {subNames.map((n) => (
            <option key={n} value={`s:${n}`}>
              {n}
            </option>
          ))}
        </optgroup>
      )}
    </ChipSelect>
  );
}
