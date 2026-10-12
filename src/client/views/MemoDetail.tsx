import clsx from 'clsx';
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { urlDomain } from '../../shared/url';
import { DoneCheck } from '../components/DoneCheck';
import { Oru } from '../components/Oru';
import { CategoryBadge } from '../components/CategoryBadge';
import { useAppData } from '../data';
import { formatDateTime, priceText } from '../lib/format';
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
  const { memos, ready, categoryMap, memberNames, toggleDone, deleteMemo } = useAppData();
  const memo = memos.find((m) => m.id === id);
  const [editing, setEditing] = useState(false);

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
      <div className="mx-auto max-w-2xl px-4 pt-5 lg:px-6">
        <div className="flex items-start gap-2">
          <div className="pt-1">
            <DoneCheck done={memo.doneAt !== null} title={memo.title} onChange={(done) => toggleDone(memo, done)} size="lg" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={clsx('display-num text-2xl leading-snug [overflow-wrap:anywhere]', memo.doneAt && 'text-ink-3 line-through decoration-ink-3/40')}>{memo.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {category ? (
                <button type="button" className="max-w-full" aria-label={`カテゴリ：${category.name}${sub ? ` › ${sub.name}` : ''}（押して直す）`} onClick={() => setEditing(true)}>
                  <CategoryBadge category={category} subcategoryName={sub?.name} className="py-1 text-sm" />
                </button>
              ) : (
                <button type="button" className="text-ink-3 underline-offset-2 hover:underline" onClick={() => setEditing(true)}>
                  カテゴリなし
                </button>
              )}
              {memo.price !== null && <span className="memo-price amount text-lg">{priceText(memo.price)}</span>}
              {memo.doneAt && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">買った</span>}
            </div>
          </div>
        </div>

        <h2 className="section-title">詳細メモ</h2>
        {memo.body.trim() ? (
          <div className="card p-4 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{memo.body}</div>
        ) : (
          <button type="button" className="card block w-full p-4 text-left text-sm text-ink-3 hover:bg-surface-2/60" onClick={() => setEditing(true)}>
            まだ何も書いていません。押すと書けます
          </button>
        )}

        <h2 className="section-title">リンク</h2>
        {memo.links.length > 0 ? (
          <div className="card divide overflow-hidden">
            {memo.links.map((l, i) => (
              <ExternalAnchor key={i} href={l.url} className="row-item hover:bg-surface-2/60">
                <ExternalLink className="size-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-brand">{l.label || urlDomain(l.url)}</span>
                  {l.label && <span className="block truncate text-xs text-ink-3">{urlDomain(l.url)}</span>}
                </span>
              </ExternalAnchor>
            ))}
          </div>
        ) : (
          <button type="button" className="card block w-full p-4 text-left text-sm text-ink-3 hover:bg-surface-2/60" onClick={() => setEditing(true)}>
            調べたページのリンクを残せます
          </button>
        )}

        <p className="mx-1 mt-6 space-y-0.5 text-xs text-ink-3">
          <span className="block">
            {name(memo.createdBy) ? `${name(memo.createdBy)}が追加` : '追加'} ・ {formatDateTime(memo.createdAt)}
          </span>
          {memo.updatedAt !== memo.createdAt && <span className="block">更新 ・ {formatDateTime(memo.updatedAt)}</span>}
          {memo.doneAt && (
            <span className="block">
              {name(memo.doneBy) ? `${name(memo.doneBy)}が買った` : '買った'} ・ {formatDateTime(memo.doneAt)}
            </span>
          )}
        </p>
      </div>

      {editing && <MemoForm memo={memo} onClose={() => setEditing(false)} />}
    </div>
  );
}
