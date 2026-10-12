import clsx from 'clsx';
import { Check, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TAG_ICON_KEYS, type TagIconKey } from '../../shared/icons';
import type { Tag, TagKind } from '../../shared/types';
import { api, errorText } from '../api';
import { useAppData } from '../data';
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

/** 購入先・ジャンルの追加・編集・削除（名前・色・アイコン）。選択のシートと管理の画面の両方から使う */
export function TagEditor({ kind, tag, onClose, onSaved }: Props) {
  const { stores, genres, reload } = useAppData();
  const toast = useToast();
  const label = KIND_LABEL[kind];
  const list = kind === 'store' ? stores : genres;
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState(tag?.color ?? TAG_PALETTE[list.length % TAG_PALETTE.length]!);
  const [icon, setIcon] = useState<string>(tag?.icon ?? (kind === 'store' ? 'store' : 'package'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
          <div className="grid grid-cols-6 gap-2" role="group" aria-label="色">
            {TAG_PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                aria-pressed={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className="flex aspect-square items-center justify-center rounded-full ring-offset-2 ring-offset-bg transition aria-pressed:ring-2 aria-pressed:ring-ink"
                style={{ backgroundColor: c }}
              >
                {color === c && <Check className="size-4 stroke-[3] text-white" />}
              </button>
            ))}
          </div>
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
        {tag && (
          <button type="button" className="btn btn-ghost btn-danger w-full" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" />
            この{label}を消す
          </button>
        )}
      </form>
      {deleting && tag && <TagDeleteSheet kind={kind} tag={tag} onClose={() => setDeleting(false)} onDeleted={onClose} />}
    </Sheet>
  );
}

/** 消す前に、使っているメモの数を出し、ほかへ移すか外すかを選ぶ */
function TagDeleteSheet({ kind, tag, onClose, onDeleted }: { kind: TagKind; tag: Tag; onClose: () => void; onDeleted: () => void }) {
  const { stores, genres, reload } = useAppData();
  const toast = useToast();
  const label = KIND_LABEL[kind];
  const others = (kind === 'store' ? stores : genres).filter((t) => t.id !== tag.id);
  const [usage, setUsage] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.tagUsage(kind, tag.id).then(
      (r) => setUsage(r.memos),
      (e) => setError(errorText(e)),
    );
  }, [kind, tag.id]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteTag(kind, tag.id, moveTo || null);
      await reload();
      toast(`「${tag.name}」を消しました`);
      onClose();
      onDeleted();
    } catch (e) {
      setError(errorText(e, '消せませんでした'));
      setBusy(false);
    }
  }

  const lose = kind === 'store' ? 'そのメモから、この購入先の値段・リンク・ひとことが外れます' : 'そのメモは「ジャンルなし」になります';
  return (
    <Sheet title={`「${tag.name}」を消す`} onClose={onClose}>
      <div className="space-y-4">
        {usage === null && !error && <p className="text-sm text-ink-3">使っているメモを数えています…</p>}
        {usage === 0 && <p className="text-sm text-ink-2">この{label}を使っているメモはありません。</p>}
        {usage !== null && usage > 0 && (
          <>
            <p className="text-sm text-ink-2">
              この{label}を使っているメモが<strong className="text-ink">{usage}件</strong>あります。ほかの{label}に移さないと、{lose}。
            </p>
            <label className="block space-y-1.5">
              <span className="label">移し先</span>
              <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">移さない</option>
                {others.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}に移す
                  </option>
                ))}
              </select>
            </label>
            {kind === 'store' && moveTo && <p className="text-xs text-ink-3">移し先の購入先がすでに付いているメモは、移し先の値段を残します。</p>}
          </>
        )}
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        <button type="button" className="btn btn-primary w-full" disabled={busy || usage === null} onClick={() => void remove()}>
          消す
        </button>
      </div>
    </Sheet>
  );
}
