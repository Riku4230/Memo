import clsx from 'clsx';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { TAG_ICON_KEYS, type TagIconKey } from '../../shared/icons';
import type { Category } from '../../shared/types';
import { api, errorText } from '../api';
import { useAppData } from '../data';
import { ColorMixer } from './ColorMixer';
import { Sheet } from './Sheet';
import { ICONS, TagIcon } from './TagIcon';
import { useToast } from './Toast';

/** 色の候補（Kakeibo のカテゴリと同じ並び） */
export const CATEGORY_PALETTE = ['#eb6834', '#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948', '#0e9fb5', '#8b5cf6', '#d55181', '#8a8f98'];

/** 大カテゴリ・中カテゴリを使っているメモの数（消していないもの） */
export function useCategoryUsage(): { categories: Map<string, number>; subcategories: Map<string, number> } {
  const { memos } = useAppData();
  const categories = new Map<string, number>();
  const subcategories = new Map<string, number>();
  for (const m of memos) {
    if (m.id.startsWith('tmp-')) continue;
    if (m.categoryId) categories.set(m.categoryId, (categories.get(m.categoryId) ?? 0) + 1);
    if (m.subcategoryId) subcategories.set(m.subcategoryId, (subcategories.get(m.subcategoryId) ?? 0) + 1);
  }
  return { categories, subcategories };
}

/** 大カテゴリの編集画面で、中カテゴリを追加・名前変更・削除する（Kakeibo の SubcategoryManager から） */
function SubcategoryManager({ categoryId }: { categoryId: string }) {
  const { categoryMap, reload } = useAppData();
  const toast = useToast();
  const usage = useCategoryUsage().subcategories;
  const subs = categoryMap.get(categoryId)?.subcategories ?? [];
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      toast(message);
      return true;
    } catch (e) {
      setError(errorText(e, '保存できませんでした'));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const enter = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      // 大カテゴリの保存（親のフォーム）を送信しないようにする
      e.preventDefault();
      fn();
    }
  };
  const add = () => {
    const name = newName.trim();
    if (name) void run(() => api.createSubcategory(categoryId, name), '中カテゴリを追加しました').then((ok) => ok && setNewName(''));
  };
  const rename = () => {
    if (editing?.name.trim()) void run(() => api.renameSubcategory(editing.id, editing.name.trim()), '名前を変えました').then((ok) => ok && setEditing(null));
  };

  return (
    <div className="space-y-2">
      <span className="label">中カテゴリ（任意）</span>
      <p className="text-xs text-ink-3">例: 100均の中を「ダイソー」「セリア」に分けると、一覧でお店ごとにまとまります</p>
      <ul className="card divide overflow-hidden" aria-label="中カテゴリの一覧">
        {subs.map((s) => (
          <li key={s.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
            {editing?.id === s.id ? (
              <>
                <input
                  className="input min-h-9 min-w-0 flex-1 py-1"
                  aria-label={`${s.name}の新しい名前`}
                  maxLength={20}
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                  onKeyDown={enter(rename)}
                />
                <button type="button" className="icon-btn" aria-label="名前を保存" disabled={busy} onClick={rename}>
                  <Check className="size-4" />
                </button>
                <button type="button" className="icon-btn" aria-label="やめる" onClick={() => setEditing(null)}>
                  <X className="size-4" />
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                {(usage.get(s.id) ?? 0) > 0 && <span className="text-xs text-ink-3">{usage.get(s.id)}件</span>}
                <button type="button" className="icon-btn" aria-label={`${s.name}の名前を変える`} onClick={() => setEditing({ id: s.id, name: s.name })}>
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${s.name}を削除`}
                  disabled={busy}
                  onClick={() => {
                    const n = usage.get(s.id) ?? 0;
                    const note = n ? `\n使っている${n}件のメモは消えず、中カテゴリなしになります。` : '';
                    if (window.confirm(`中カテゴリ「${s.name}」を削除しますか？${note}`)) void run(() => api.deleteSubcategory(s.id), '中カテゴリを削除しました');
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </li>
        ))}
        <li className="flex items-center gap-2 px-3 py-2">
          <input
            className="input min-h-9 min-w-0 flex-1 py-1"
            aria-label="追加する中カテゴリの名前"
            placeholder="例: ダイソー"
            maxLength={20}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={enter(add)}
          />
          <button type="button" className="btn btn-sm shrink-0" disabled={busy || !newName.trim()} onClick={add}>
            <Plus className="size-4" />
            追加
          </button>
        </li>
      </ul>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

interface Props {
  /** 編集する大カテゴリ。新規なら undefined */
  category?: Category;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

/** 大カテゴリの追加・編集（名前・色・アイコン・中カテゴリ）。選ぶ画面と管理の画面の両方から使う（Kakeibo の CategoryEditor と同じ作り） */
export function CategoryEditor({ category, onClose, onSaved }: Props) {
  const { categories, reload } = useAppData();
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length]!);
  const [icon, setIcon] = useState<string>(category?.icon ?? 'package');
  const [mixing, setMixing] = useState(false);
  /** 並びの色を押したら、グラデーションのつまみをその色の位置に合わせ直す */
  const [mixKey, setMixKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), color, icon };
      const id = category ? (await api.updateCategory(category.id, body), category.id) : (await api.createCategory(body)).id;
      await reload();
      toast(category ? '保存しました' : '大カテゴリを追加しました');
      onSaved?.(id);
      onClose();
    } catch (e) {
      setError(errorText(e, '保存できませんでした'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={category ? '大カテゴリを編集' : '大カテゴリを追加'} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          // 入力画面のフォームの上に重ねて開くため、送信が親のフォームに伝わらないようにする
          e.stopPropagation();
          void save();
        }}
      >
        <div className="flex items-center gap-3">
          <TagIcon icon={icon} color={color} size="lg" />
          <div className="flex-1 space-y-1.5">
            <label className="label" htmlFor="cat-name">
              名前（20文字まで）
            </label>
            <input id="cat-name" className="input" value={name} maxLength={20} required autoFocus onChange={(e) => setName(e.target.value)} placeholder="例: 本" />
          </div>
        </div>
        <div className="space-y-2">
          <span className="label">色</span>
          <div className="grid grid-cols-7 gap-2" role="group" aria-label="色">
            {[...CATEGORY_PALETTE, ...(CATEGORY_PALETTE.includes(color) ? [] : [color])].map((c) => (
              <button
                type="button"
                key={c}
                aria-pressed={color === c}
                aria-label={c}
                onClick={() => {
                  setColor(c);
                  // 作った色を押したら、グラデーションをその色の位置で開き直して作り直せるようにする
                  if (!CATEGORY_PALETTE.includes(c)) setMixing(true);
                  setMixKey((k) => k + 1);
                }}
                className="flex aspect-square items-center justify-center rounded-full ring-offset-2 ring-offset-bg transition aria-pressed:ring-2 aria-pressed:ring-ink"
                style={{ backgroundColor: c }}
              >
                {color === c && <Check className="size-4 stroke-[3] text-white" />}
              </button>
            ))}
            <button
              type="button"
              aria-label="色を作る"
              aria-expanded={mixing}
              onClick={() => setMixing((v) => !v)}
              className={clsx('flex aspect-square items-center justify-center rounded-full border-2 border-dashed text-ink-3', mixing ? 'border-ink-3' : 'border-line')}
            >
              <Plus className="size-4" />
            </button>
          </div>
          {/* 決まった色以外は、グラデーションから作る（動かすとすぐ上のアイコンの色が変わる） */}
          {mixing && (
            <div className="card p-3">
              <ColorMixer key={mixKey} initial={color} onChange={setColor} />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <span className="label">アイコン</span>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-9" role="group" aria-label="アイコン">
            {TAG_ICON_KEYS.map((key: TagIconKey) => {
              const Icon = ICONS[key];
              return (
                <button
                  type="button"
                  key={key}
                  aria-pressed={icon === key}
                  aria-label={key}
                  onClick={() => setIcon(key)}
                  className={clsx(
                    'flex aspect-square items-center justify-center rounded-lg border transition duration-200',
                    icon === key ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                  )}
                >
                  <Icon className="size-5" />
                </button>
              );
            })}
          </div>
        </div>
        {/* 中カテゴリは追加・変更したその場で保存する（新しい大カテゴリでは、作ってから編集で足す） */}
        {category && <SubcategoryManager categoryId={category.id} />}
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
          {category ? '保存する' : '追加する'}
        </button>
      </form>
    </Sheet>
  );
}

/** 大カテゴリを消す。使っているメモがあれば「ほかへ移す」か「外す」を選ぶ（Kakeibo の DeleteCategory と同じ作り） */
export function CategoryDeleteSheet({ category, usage, onClose }: { category: Category; usage: number; onClose: () => void }) {
  const { categories, reload } = useAppData();
  const toast = useToast();
  const targets = categories.filter((c) => c.id !== category.id);
  const [mode, setMode] = useState<'move' | 'drop'>(targets.length ? 'move' : 'drop');
  const [moveTo, setMoveTo] = useState(targets[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inUse = usage > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteCategory(category.id, inUse && mode === 'move' ? moveTo : null);
      await reload();
      toast('大カテゴリを削除しました');
      onClose();
    } catch (e) {
      setError(errorText(e, '削除できませんでした'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={`「${category.name}」を削除`} onClose={onClose}>
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
      <div className="space-y-4">
        {category.subcategories.length > 0 && <p className="text-sm text-ink-2">中カテゴリ（{category.subcategories.map((s) => s.name).join('・')}）も一緒に消えます。</p>}
        {inUse ? (
          <>
            <p className="text-sm text-ink-2">この大カテゴリを使っているメモが {usage} 件あります。メモをどうするか選んでください。</p>
            <div className="card divide overflow-hidden" role="radiogroup" aria-label="メモの扱い">
              <label className={clsx('flex cursor-pointer items-start gap-3 px-4 py-3', !targets.length && 'opacity-50')}>
                <input type="radio" name="mode" className="mt-1 size-4 accent-[#cc4a0b]" checked={mode === 'move'} disabled={!targets.length} onChange={() => setMode('move')} />
                <span className="flex-1 space-y-2">
                  <span className="block font-medium">別の大カテゴリへ移す</span>
                  {mode === 'move' && targets.length > 0 && (
                    <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="移動先">
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {mode === 'move' && <span className="block text-xs text-ink-3">中カテゴリは外れます</span>}
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                <input type="radio" name="mode" className="mt-1 size-4 accent-[#cc4a0b]" checked={mode === 'drop'} onChange={() => setMode('drop')} />
                <span>
                  <span className="block font-medium">移さずに外す</span>
                  <span className="text-xs text-ink-3">メモは「カテゴリなし」になります（メモは残ります）</span>
                </span>
              </label>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-2">この大カテゴリを削除しますか？（使っているメモはありません）</p>
        )}
        <button type="button" className="btn w-full border-transparent bg-danger font-semibold text-white hover:bg-danger/90" disabled={busy} onClick={() => void submit()}>
          <Trash2 className="size-4" />
          削除する
        </button>
      </div>
    </Sheet>
  );
}
