import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { api, errorText } from '../api';
import { useAppData } from '../data';
import { CategoryEditor } from './CategoryEditor';
import { Sheet } from './Sheet';
import { TagIcon } from './TagIcon';

/** アイコンのグリッドで大カテゴリを選ぶ。もう一度押すと外れる。末尾の「追加」からその場で作れる（Kakeibo の CategoryPicker から） */
export function CategoryGrid({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { categories } = useAppData();
  const [adding, setAdding] = useState(false);
  const tile = 'flex flex-col items-center gap-1 rounded-lg border px-1 py-2.5 text-[12px] leading-tight transition duration-200';
  return (
    <>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="group" aria-label="大カテゴリ">
        {categories.map((c) => (
          <button
            type="button"
            key={c.id}
            aria-pressed={c.id === value}
            onClick={() => onChange(c.id === value ? null : c.id)}
            className={clsx(tile, c.id === value ? 'border-brand bg-brand-soft font-semibold text-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')}
          >
            <TagIcon icon={c.icon} color={c.color} />
            <span className="line-clamp-1 max-w-full px-0.5">{c.name}</span>
          </button>
        ))}
        <button type="button" onClick={() => setAdding(true)} className={clsx(tile, 'border-dashed border-ink-3/40 text-ink-3 hover:bg-surface-2 hover:text-ink')}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2">
            <Plus className="size-5" />
          </span>
          <span>追加</span>
        </button>
      </div>
      {adding && <CategoryEditor onClose={() => setAdding(false)} onSaved={(id) => onChange(id)} />}
    </>
  );
}

/**
 * 大カテゴリの中の中カテゴリを選ぶ（任意）。「＋」からその場で中カテゴリを足せる（Kakeibo の SubcategoryPicker から）。
 * 中カテゴリがまだない大カテゴリでは、足すためのボタンだけを出す
 */
export function SubcategoryPicker({ categoryId, value, onChange }: { categoryId: string; value: string | null; onChange: (id: string | null) => void }) {
  const { categoryMap, reload } = useAppData();
  const cat = categoryMap.get(categoryId);
  const subs = cat?.subcategories ?? [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!cat) return null;

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createSubcategory(categoryId, trimmed);
      await reload();
      onChange(id);
      setName('');
      setAdding(false);
    } catch (e) {
      setError(errorText(e, '追加できませんでした'));
    } finally {
      setBusy(false);
    }
  }

  const chip = 'chip shrink-0';
  return (
    <div className="space-y-2">
      <span className="label block">{cat.name}の中カテゴリ（任意）</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="中カテゴリ">
        {subs.length > 0 && (
          <button type="button" className={chip} aria-pressed={value === null} onClick={() => onChange(null)}>
            なし
          </button>
        )}
        {subs.map((s) => (
          <button key={s.id} type="button" className={chip} aria-pressed={value === s.id} onClick={() => onChange(s.id)}>
            {s.name}
          </button>
        ))}
        {!adding && (
          <button type="button" className={clsx(chip, 'border-dashed text-ink-3')} onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            {subs.length ? '追加' : `${cat.name}に中カテゴリを追加`}
          </button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2">
          <input
            className="input min-w-0 flex-1"
            aria-label="新しい中カテゴリの名前"
            placeholder="例: ダイソー"
            maxLength={20}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                // 入力画面のフォームを送信しないようにする
                e.preventDefault();
                void add();
              }
            }}
          />
          <button type="button" className="btn btn-primary shrink-0" disabled={busy || !name.trim()} onClick={() => void add()}>
            追加
          </button>
          <button type="button" className="btn shrink-0" onClick={() => (setAdding(false), setName(''), setError(null))}>
            やめる
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** 大カテゴリと中カテゴリを選ぶシート（すぐ登録から開く）。選んで「決定」で返す */
export function CategoryPickerSheet({
  categoryId,
  subcategoryId,
  onChange,
  onClose,
}: {
  categoryId: string | null;
  subcategoryId: string | null;
  onChange: (categoryId: string | null, subcategoryId: string | null) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState(categoryId);
  const [sub, setSub] = useState(subcategoryId);
  return (
    <Sheet title="カテゴリを選ぶ" onClose={onClose}>
      <div className="space-y-4">
        <CategoryGrid
          value={cat}
          onChange={(id) => {
            setCat(id);
            // 別の大カテゴリにしたら、中カテゴリは選び直す
            if (id !== cat) setSub(null);
          }}
        />
        {cat && <SubcategoryPicker categoryId={cat} value={sub} onChange={setSub} />}
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => {
            onChange(cat, cat ? sub : null);
            onClose();
          }}
        >
          決定
        </button>
      </div>
    </Sheet>
  );
}
