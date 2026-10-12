import clsx from 'clsx';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TAG_ICON_KEYS, type TagIconKey } from '../../shared/icons';
import type { Tag, TagKind } from '../../shared/types';
import { api, errorText } from '../api';
import { useAppData } from '../data';
import { ColorMixer } from './ColorMixer';
import { Sheet } from './Sheet';
import { ICONS, TagIcon } from './TagIcon';
import { useToast } from './Toast';

/** 色の候補（Kakeibo のカテゴリと同じ並び） */
export const TAG_PALETTE = ['#eb6834', '#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948', '#0e9fb5', '#8b5cf6', '#d55181', '#8a8f98'];

export const KIND_LABEL: Record<TagKind, string> = { store: '購入先', genre: 'ジャンル' };

interface Props {
  kind: TagKind;
  /** 編集するもの。新規なら undefined */
  tag?: Tag;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

/** 購入先・ジャンルの追加・編集（名前・色・アイコン）。選択のシートと管理の画面の両方から使う（Kakeibo の CategoryEditor と同じ作り） */
export function TagEditor({ kind, tag, onClose, onSaved }: Props) {
  const { stores, genres, reload } = useAppData();
  const toast = useToast();
  const label = KIND_LABEL[kind];
  const list = kind === 'store' ? stores : genres;
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState(tag?.color ?? TAG_PALETTE[list.length % TAG_PALETTE.length]!);
  const [icon, setIcon] = useState<string>(tag?.icon ?? (kind === 'store' ? 'store' : 'package'));
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
      const id = tag ? (await api.updateTag(kind, tag.id, body), tag.id) : (await api.createTag(kind, body)).id;
      await reload();
      toast(tag ? '保存しました' : `${label}を追加しました`);
      onSaved?.(id);
      onClose();
    } catch (e) {
      setError(errorText(e, '保存できませんでした'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={tag ? `${label}を編集` : `${label}を追加`} onClose={onClose}>
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
            <label className="label" htmlFor="tag-name">
              名前（20文字まで）
            </label>
            <input
              id="tag-name"
              className="input"
              value={name}
              maxLength={20}
              required
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'store' ? '例: コストコ' : '例: 掃除機'}
            />
          </div>
        </div>
        <div className="space-y-2">
          <span className="label">色</span>
          <div className="grid grid-cols-7 gap-2" role="group" aria-label="色">
            {[...TAG_PALETTE, ...(TAG_PALETTE.includes(color) ? [] : [color])].map((c) => (
              <button
                type="button"
                key={c}
                aria-pressed={color === c}
                aria-label={c}
                onClick={() => {
                  setColor(c);
                  // 作った色を押したら、グラデーションをその色の位置で開き直して作り直せるようにする
                  if (!TAG_PALETTE.includes(c)) setMixing(true);
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
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
          {tag ? '保存する' : '追加する'}
        </button>
      </form>
    </Sheet>
  );
}

/** その購入先・ジャンルを使っているメモの数（消していないもの） */
export function useTagUsage(kind: TagKind): Map<string, number> {
  const { memos } = useAppData();
  const counts = new Map<string, number>();
  for (const m of memos) {
    if (m.id.startsWith('tmp-')) continue;
    if (kind === 'genre') {
      if (m.genreId) counts.set(m.genreId, (counts.get(m.genreId) ?? 0) + 1);
    } else for (const o of m.offers) counts.set(o.storeId, (counts.get(o.storeId) ?? 0) + 1);
  }
  return counts;
}

/** 消す。使っているメモがあれば「ほかへ移す」か「外す」を選ぶ（Kakeibo の DeleteCategory と同じ作り） */
export function TagDeleteSheet({ kind, tag, usage, onClose }: { kind: TagKind; tag: Tag; usage: number; onClose: () => void }) {
  const { stores, genres, reload } = useAppData();
  const toast = useToast();
  const label = KIND_LABEL[kind];
  const targets = (kind === 'store' ? stores : genres).filter((t) => t.id !== tag.id);
  const [mode, setMode] = useState<'move' | 'drop'>(targets.length ? 'move' : 'drop');
  const [moveTo, setMoveTo] = useState(targets[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inUse = usage > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteTag(kind, tag.id, inUse && mode === 'move' ? moveTo : null);
      await reload();
      toast(`${label}を削除しました`);
      onClose();
    } catch (e) {
      setError(errorText(e, '削除できませんでした'));
      setBusy(false);
    }
  }

  return (
    <Sheet title={`「${tag.name}」を削除`} onClose={onClose}>
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
      <div className="space-y-4">
        {inUse ? (
          <>
            <p className="text-sm text-ink-2">
              この{label}を使っているメモが {usage} 件あります。メモをどうするか選んでください。
            </p>
            <div className="card divide overflow-hidden" role="radiogroup" aria-label="メモの扱い">
              <label className={clsx('flex cursor-pointer items-start gap-3 px-4 py-3', !targets.length && 'opacity-50')}>
                <input type="radio" name="mode" className="mt-1 size-4 accent-[#cc4a0b]" checked={mode === 'move'} disabled={!targets.length} onChange={() => setMode('move')} />
                <span className="flex-1 space-y-2">
                  <span className="block font-medium">別の{label}へ移す</span>
                  {mode === 'move' && targets.length > 0 && (
                    <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="移動先">
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {mode === 'move' && kind === 'store' && <span className="block text-xs text-ink-3">移動先がすでに付いているメモは、移動先の値段を残します</span>}
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                <input type="radio" name="mode" className="mt-1 size-4 accent-[#cc4a0b]" checked={mode === 'drop'} onChange={() => setMode('drop')} />
                <span>
                  <span className="block font-medium">移さずに外す</span>
                  <span className="text-xs text-ink-3">
                    {kind === 'store' ? 'メモから、この購入先の値段・リンク・ひとことが消えます（メモは残ります）' : 'メモは「ジャンルなし」になります（メモは残ります）'}
                  </span>
                </span>
              </label>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-2">この{label}を削除しますか？（使っているメモはありません）</p>
        )}
        <button type="button" className="btn w-full border-transparent bg-danger font-semibold text-white hover:bg-danger/90" disabled={busy} onClick={() => void submit()}>
          <Trash2 className="size-4" />
          削除する
        </button>
      </div>
    </Sheet>
  );
}
