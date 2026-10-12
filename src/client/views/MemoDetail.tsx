import clsx from 'clsx';
import { ArrowLeft, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { todayJst } from '../../shared/date';
import { cheapestPrice, isStale, sortOffers } from '../../shared/memo';
import type { Memo, Offer } from '../../shared/types';
import { urlDomain } from '../../shared/url';
import { DoneCheck } from '../components/DoneCheck';
import { Oru } from '../components/Oru';
import { TagIcon } from '../components/TagIcon';
import { useAppData } from '../data';
import { formatDateTime, formatDay, priceText } from '../lib/format';
import { goBack, navigate } from '../lib/router';
import { MemoForm } from './MemoForm';
import { OfferSheet } from './OfferSheet';

function ExternalAnchor({ href, children, className, label }: { href: string; children: React.ReactNode; className?: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={label} onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
}

function OfferList({ memo, onEdit, onAdd }: { memo: Memo; onEdit: (o: Offer) => void; onAdd: () => void }) {
  const { storeMap } = useAppData();
  const today = todayJst();
  const offers = sortOffers(memo.offers.filter((o) => storeMap.has(o.storeId)));
  const min = cheapestPrice(offers);
  const pricedCount = offers.filter((o) => o.price !== null).length;
  return (
    <div className="card divide overflow-hidden">
      {offers.map((o) => {
        const store = storeMap.get(o.storeId)!;
        const cheapest = pricedCount > 1 && o.price !== null && o.price === min;
        const diff = min !== null && o.price !== null ? o.price - min : 0;
        return (
          <div key={o.storeId} className="offer-row flex items-stretch">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60" onClick={() => onEdit(o)}>
              <TagIcon icon={store.icon} color={store.color} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{store.name}</span>
                  {cheapest && <span className="rounded-full bg-income/10 px-2 py-0.5 text-[11px] font-semibold text-income">いちばん安い</span>}
                  {isStale(o, today) && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] text-warn-ink">値段が古いかも</span>}
                </span>
                {(o.note || o.checkedOn) && (
                  <span className="mt-0.5 block text-xs text-ink-3">
                    {[o.note, o.checkedOn && `${formatDay(o.checkedOn)} に確認`].filter(Boolean).join(' ・ ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                {o.price !== null ? <span className="amount block">{priceText(o.price)}</span> : <span className="block text-sm text-ink-3">値段なし</span>}
                {diff > 0 && <span className="block text-xs text-ink-3">+{priceText(diff)}</span>}
              </span>
            </button>
            {o.url && (
              <ExternalAnchor href={o.url} className="flex w-12 shrink-0 items-center justify-center border-l border-line text-ink-3 hover:bg-surface-2/60 hover:text-brand" label={`${store.name}の商品ページを開く`}>
                <ExternalLink className="size-4" />
              </ExternalAnchor>
            )}
          </div>
        );
      })}
      <button type="button" className="row-item min-h-12 font-medium text-brand hover:bg-surface-2/60" onClick={onAdd}>
        <Plus className="size-5" />
        購入先を足す
      </button>
    </div>
  );
}

/** 1件のメモのページ（/m/:id）。スマホは1画面、PC は一覧の右に出す */
export function MemoDetail({ id, desktop }: { id: string; desktop: boolean }) {
  const { memos, ready, genreMap, memberNames, toggleDone, deleteMemo } = useAppData();
  const memo = memos.find((m) => m.id === id);
  const [editing, setEditing] = useState(false);
  const [offer, setOffer] = useState<Offer | 'new' | null>(null);

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
              <p className="text-sm text-ink-2">このメモは見つかりません。消されたか、まだ読み込めていません。</p>
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

  const genre = memo.genreId ? genreMap.get(memo.genreId) : undefined;
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
              {genre ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pr-3 pl-1.5">
                  <TagIcon icon={genre.icon} color={genre.color} size="xs" />
                  {genre.name}
                </span>
              ) : (
                <button type="button" className="text-ink-3 underline-offset-2 hover:underline" onClick={() => setEditing(true)}>
                  ジャンルなし
                </button>
              )}
              {memo.doneAt && <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">買った</span>}
            </div>
          </div>
        </div>

        <h2 className="section-title">お店ごとの値段</h2>
        <OfferList memo={memo} onEdit={setOffer} onAdd={() => setOffer('new')} />

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
      {offer && <OfferSheet memo={memo} offer={offer === 'new' ? null : offer} onClose={() => setOffer(null)} />}
    </div>
  );
}
