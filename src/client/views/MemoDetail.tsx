import clsx from 'clsx';
import { ArrowLeft, CheckCheck, ExternalLink, JapaneseYen, Link2, Pencil, Tags, Trash2, UserRound } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MemoUpdateInput } from '../../shared/schemas';
import type { Memo } from '../../shared/types';
import { api, ApiError, errorText } from '../api';
import { CategoryPickerSheet } from '../components/CategoryPicker';
import { PriceInput } from '../components/PriceInput';
import { useToast } from '../components/Toast';
import { urlDomain } from '../../shared/url';
import { DoneCheck } from '../components/DoneCheck';
import { Oru } from '../components/Oru';
import { CategoryBadge } from '../components/CategoryBadge';
import { useAppData } from '../data';
import { formatDate, formatDateTime, priceText } from '../lib/format';
import { goBack, navigate } from '../lib/router';
import { MemoForm } from './MemoForm';

function ExternalAnchor({ href, children, className, label }: { href: string; children: React.ReactNode; className?: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={label} onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
}

/** 1件のメモのページ（/m/:id）。スマホは1画面、PC は一覧の右に出す */
export function MemoDetail({ id, desktop }: { id: string; desktop: boolean }) {
  const { memos, ready, categoryMap, memberNames, toggleDone, deleteMemo, upsertMemo, reload } = useAppData();
  const memo = memos.find((m) => m.id === id);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const toast = useToast();

  /** 1項目だけ直して保存する。先に画面に出し、失敗したら戻す。ほかの人が先に直していたら（409）最新を読み直す */
  async function save(patch: Omit<MemoUpdateInput, 'baseUpdatedAt'>): Promise<boolean> {
    if (!memo) return false;
    const before = memo;
    upsertMemo({ ...memo, ...patch } as Memo);
    try {
      upsertMemo(await api.updateMemo(memo.id, { ...patch, baseUpdatedAt: memo.updatedAt }));
      return true;
    } catch (e) {
      upsertMemo(before);
      if (e instanceof ApiError && e.status === 409) {
        await reload();
        toast(e.message, { error: true });
      } else {
        toast(errorText(e, '保存できませんでした'), { error: true });
      }
      return false;
    }
  }

  const header = (
    <header className="app-top sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-bg/95 px-2 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2 backdrop-blur lg:px-6 lg:pt-4">
      {!desktop && (
        <button type="button" className="icon-btn" aria-label="一覧に戻る" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </button>
      )}
      <span className="flex-1" />
      {memo && (
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            直す
          </button>
          <button
            type="button"
            className="icon-btn hover:text-danger"
            aria-label="このメモを消す"
            onClick={() => {
              if (!window.confirm(`「${memo.title}」を消しますか？`)) return;
              void deleteMemo(memo).then((ok) => ok && navigate('/', true));
            }}
          >
            <Trash2 className="size-5" />
          </button>
        </>
      )}
    </header>
  );

  if (!memo) {
    return (
      <div className="min-h-full">
        {header}
        <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
          {ready ? (
            <>
              <Oru anim="sad" size={84} />
              <p className="text-sm text-ink-2">
                このメモは見つかりません。
                <br />
                消されたか、まだ読み込めていません。
              </p>
              <button type="button" className="btn btn-sm" onClick={() => navigate('/', true)}>
                一覧へ
              </button>
            </>
          ) : (
            <p className="text-sm text-ink-3">読み込み中…</p>
          )}
        </div>
      </div>
    );
  }

  const category = memo.categoryId ? categoryMap.get(memo.categoryId) : undefined;
  const sub = category?.subcategories.find((s) => s.id === memo.subcategoryId);
  const name = (userId: string | null) => (userId ? memberNames.get(userId) : undefined);
  return (
    <div className="memo-detail min-h-full pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
      {header}
      {/* Notion のページの形：名前、プロパティ（項目名と中身の行）、区切り線、本文（詳細メモ）。それぞれ押すとその場で直せる */}
      <div className="mx-auto max-w-2xl px-4 pt-6 lg:px-6">
        <div className="flex items-start gap-2">
          <div className="pt-1">
            <DoneCheck done={memo.doneAt !== null} title={memo.title} onChange={(done) => toggleDone(memo, done)} size="lg" />
          </div>
          <h1 className={clsx('display-num min-w-0 flex-1 text-2xl leading-snug [overflow-wrap:anywhere]', memo.doneAt && 'text-ink-3 line-through decoration-ink-3/40')}>
            <InlineTitle memo={memo} onSave={save} />
          </h1>
        </div>

        <div className="memo-props mt-5 space-y-0.5">
          <PropRow icon={<Tags className="size-4" />} label="カテゴリ">
            <button type="button" className="prop-value" aria-label={`カテゴリ：${category ? `${category.name}${sub ? ` › ${sub.name}` : ''}` : 'なし'}（押して選ぶ）`} onClick={() => setPicking(true)}>
              {category ? <CategoryBadge category={category} subcategoryName={sub?.name} className="text-sm" /> : <span className="prop-empty">空</span>}
            </button>
          </PropRow>
          <PropRow icon={<JapaneseYen className="size-4" />} label="値段">
            <InlinePrice memo={memo} onSave={save} />
          </PropRow>
          <PropRow icon={<Link2 className="size-4" />} label="リンク">
            {memo.links.length > 0 ? (
              <div className="flex min-w-0 flex-1 items-start gap-1">
                <div className="min-w-0 flex-1 py-1">
                  {memo.links.map((l, i) => (
                    <ExternalAnchor key={i} href={l.url} className="flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-surface-2">
                      <ExternalLink className="size-3.5 shrink-0 text-ink-3" />
                      <span className="truncate text-brand">{l.label || urlDomain(l.url)}</span>
                      {l.label && <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">{urlDomain(l.url)}</span>}
                    </ExternalAnchor>
                  ))}
                </div>
                <button type="button" className="icon-btn size-9 text-ink-3" aria-label="リンクを編集" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" />
                </button>
              </div>
            ) : (
              <button type="button" className="prop-value" onClick={() => setEditing(true)}>
                <span className="prop-empty">空</span>
              </button>
            )}
          </PropRow>
          <PropRow icon={<UserRound className="size-4" />} label="追加">
            <span className="prop-value text-ink-2">
              {name(memo.createdBy) ? `${name(memo.createdBy)} ・ ` : ''}
              {formatDateTime(memo.createdAt)}
            </span>
          </PropRow>
          {memo.doneAt && (
            // 買ったものだけ、いつ買ったか（チェックを付けた日）を出す
            <PropRow icon={<CheckCheck className="size-4" />} label="買った日">
              <span className="done-date prop-value font-medium text-brand">
                {name(memo.doneBy) ? `${name(memo.doneBy)}が` : ''}
                {formatDate(memo.doneAt)}に買った
              </span>
            </PropRow>
          )}
        </div>

        <hr className="my-5 border-line" />

        <InlineBody memo={memo} onSave={save} />
      </div>

      {picking && (
        <CategoryPickerSheet
          categoryId={memo.categoryId}
          subcategoryId={memo.subcategoryId}
          onChange={(categoryId, subcategoryId) => {
            if (categoryId !== memo.categoryId || subcategoryId !== memo.subcategoryId) void save({ categoryId, subcategoryId });
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {editing && <MemoForm memo={memo} onClose={() => setEditing(false)} />}
    </div>
  );
}

type SaveFn = (patch: Omit<MemoUpdateInput, 'baseUpdatedAt'>) => Promise<boolean>;

function PropRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="prop-row">
      <span className="prop-label">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

/** 名前：押すとその場で入力欄になる。Enter か欄の外で保存、Esc でやめる。空にはできない */
function InlineTitle({ memo, onSave }: { memo: Memo; onSave: SaveFn }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  if (draft === null) {
    return (
      <button type="button" className="-mx-1 w-full rounded-md px-1 text-left transition duration-150 hover:bg-surface-2" onClick={() => setDraft(memo.title)}>
        {memo.title}
      </button>
    );
  }
  const commit = () => {
    const name = draft.trim().slice(0, 100);
    setDraft(null);
    if (cancelled.current) cancelled.current = false;
    else if (name && name !== memo.title) void onSave({ title: name });
  };
  return (
    <input
      className="-mx-1 w-full rounded-md bg-surface-2 px-1 text-2xl font-bold outline-none"
      aria-label="名前"
      value={draft}
      maxLength={100}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** 値段：押すとその場で入力欄になる。Enter か欄の外で保存、Esc でやめる。空にすると値段なし */
function InlinePrice({ memo, onSave }: { memo: Memo; onSave: SaveFn }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  if (draft === null) {
    return (
      <button type="button" className={clsx('prop-value', memo.price === null && 'memo-price-empty')} onClick={() => setDraft(memo.price === null ? '' : String(memo.price))}>
        {memo.price !== null ? <span className="memo-price amount">{priceText(memo.price)}</span> : <span className="prop-empty">空</span>}
      </button>
    );
  }
  const commit = () => {
    const price = draft === '' ? null : Number(draft);
    setDraft(null);
    if (cancelled.current) cancelled.current = false;
    else if (price !== memo.price) void onSave({ price });
  };
  return (
    <div
      className="w-40"
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLElement).blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          (e.target as HTMLElement).blur();
        }
      }}
    >
      <PriceInput value={draft} onChange={setDraft} ariaLabel="値段" className="cell-input h-10 text-left" autoFocus />
    </div>
  );
}

/** 詳細メモ：枠なしの本文。押すとその場で書ける。欄の外で保存、Esc でやめる */
function InlineBody({ memo, onSave }: { memo: Memo; onSave: SaveFn }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  // 書いた分だけ高さを伸ばす
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  if (draft === null) {
    return (
      <button
        type="button"
        className={clsx(
          'memo-body -mx-2 block min-h-24 w-[calc(100%+1rem)] rounded-md px-2 py-1.5 text-left leading-relaxed whitespace-pre-wrap transition duration-150 [overflow-wrap:anywhere] hover:bg-surface-2/60',
          !memo.body.trim() && 'text-ink-3',
        )}
        aria-label={memo.body.trim() ? undefined : '詳細メモを書く'}
        onClick={() => setDraft(memo.body)}
      >
        {memo.body.trim() ? memo.body : '詳細メモを書く（サイズ、型番、気になる点など）'}
      </button>
    );
  }
  return (
    <textarea
      ref={ref}
      className="-mx-2 block min-h-24 w-[calc(100%+1rem)] resize-none rounded-md bg-surface-2/60 px-2 py-1.5 leading-relaxed outline-none"
      aria-label="詳細メモ"
      value={draft}
      maxLength={5000}
      autoFocus
      placeholder="サイズ、型番、気になる点など"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const body = draft;
        setDraft(null);
        if (cancelled.current) cancelled.current = false;
        else if (body !== memo.body) void onSave({ body });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
