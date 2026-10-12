import clsx from 'clsx';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import type { TagKind } from '../../shared/types';
import { useAppData } from '../data';
import { Sheet } from './Sheet';
import { KIND_LABEL, TagEditor } from './TagEditor';
import { TagIcon } from './TagIcon';

interface Props {
  kind: TagKind;
  /** 選んでいる ID（ジャンルは0〜1個、購入先は0個以上） */
  value: string[];
  multiple: boolean;
  onChange: (ids: string[]) => void;
}

/** アイコンのグリッドで購入先・ジャンルを選ぶ。末尾の「追加」からその場で新しく作れる（Kakeibo の CategoryPicker から） */
export function TagGrid({ kind, value, multiple, onChange }: Props) {
  const { stores, genres } = useAppData();
  const [adding, setAdding] = useState(false);
  const options = kind === 'store' ? stores : genres;
  const tile = 'relative flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5 text-[12px] leading-tight transition duration-200';
  const toggle = (id: string) => {
    const on = value.includes(id);
    if (multiple) onChange(on ? value.filter((v) => v !== id) : [...value, id]);
    else onChange(on ? [] : [id]);
  };
  return (
    <>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="group" aria-label={KIND_LABEL[kind]}>
        {options.map((t) => {
          const on = value.includes(t.id);
          return (
            <button
              type="button"
              key={t.id}
              aria-pressed={on}
              onClick={() => toggle(t.id)}
              className={clsx(tile, on ? 'border-brand bg-brand-soft font-semibold text-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')}
            >
              {multiple && on && (
                <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-brand-strong text-white">
                  <Check className="size-3 stroke-[3]" />
                </span>
              )}
              <TagIcon icon={t.icon} color={t.color} />
              <span className="line-clamp-1 max-w-full px-0.5">{t.name}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setAdding(true)} className={clsx(tile, 'border-dashed border-ink-3/40 text-ink-3 hover:bg-surface-2 hover:text-ink')}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2">
            <Plus className="size-5" />
          </span>
          <span>追加</span>
        </button>
      </div>
      {adding && (
        <TagEditor
          kind={kind}
          onClose={() => setAdding(false)}
          onSaved={(id) => onChange(multiple ? [...value.filter((v) => v !== id), id] : [id])}
        />
      )}
    </>
  );
}

/** 選ぶためのシート（すぐ登録・絞り込みから開く） */
export function TagPickerSheet({ kind, value, multiple, onChange, onClose, title }: Props & { onClose: () => void; title?: string }) {
  return (
    <Sheet title={title ?? `${KIND_LABEL[kind]}を選ぶ`} onClose={onClose}>
      <div className="space-y-4">
        {multiple && <p className="text-sm text-ink-3">いくつでも選べます。お店ごとの値段は、あとで詳しく書けます。</p>}
        <TagGrid
          kind={kind}
          value={value}
          multiple={multiple}
          onChange={(ids) => {
            onChange(ids);
            // 1つだけ選ぶときは、選んだらすぐ閉じる
            if (!multiple && ids.length) onClose();
          }}
        />
        <div className="flex gap-2">
          {value.length > 0 && (
            <button type="button" className="btn flex-1" onClick={() => (onChange([]), onClose())}>
              選ばない
            </button>
          )}
          <button type="button" className="btn btn-primary flex-1" onClick={onClose}>
            決定
          </button>
        </div>
      </div>
    </Sheet>
  );
}
