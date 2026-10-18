import clsx from 'clsx';
import { ArrowLeft, Check, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { todayJst } from '../../shared/date';
import type { Memo } from '../../shared/types';
import { errorText, api } from '../api';
import { CategoryBadge } from '../components/CategoryBadge';
import { CategoryFilterSelect } from '../components/ChipSelect';
import { Oru } from '../components/Oru';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';
import { priceText } from '../lib/format';
import { haptic } from '../lib/haptics';
import { boughtHistory, dayLabel, subcategoryNames, type BoughtFilter } from '../lib/list';
import { goBack, navigate } from '../lib/router';

/** 「もう一度」：買ったものと同じ中身で、新しく欲しいものを作る（元のメモは買った記録として残す） */
function useBuyAgain() {
  const { user, upsertMemo, removeLocal } = useAppData();
  const toast = useToast();
  return async (m: Memo) => {
    const clientId = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();
    const temp: Memo = { ...m, id: `tmp-${clientId}`, doneAt: null, doneBy: null, createdBy: user.id, createdAt: now, updatedAt: now };
    haptic();
    upsertMemo(temp);
    try {
      const saved = await api.createMemo({
        title: m.title,
        body: m.body,
        categoryId: m.categoryId,
        subcategoryId: m.subcategoryId,
        price: m.price,
        links: m.links,
        clientId,
      });
      removeLocal(temp.id);
      upsertMemo(saved);
      toast(`「${m.title}」を欲しいものに入れました`);
      return true;
    } catch (e) {
      removeLocal(temp.id);
      toast(errorText(e, '追加できませんでした'), { error: true });
      return false;
    }
  };
}

/** 買ったものの履歴。買った日ごとに、誰が買ったか・値段を出し、「もう一度」で欲しいものに入れ直せる */
export function BoughtView() {
  const { memos, categories, categoryMap, memberNames, ready } = useAppData();
  const [filter, setFilter] = useState<BoughtFilter>({ doneBy: null, categoryId: null, subcategoryName: null });
  /** この画面で「もう一度」を押したメモ（続けて押して二重に作らないように） */
  const [again, setAgain] = useState<Set<string>>(new Set());
  const buyAgain = useBuyAgain();
  const today = todayJst();
  const days = useMemo(() => boughtHistory(memos, filter, categories), [memos, filter, categories]);
  const subNames = useMemo(() => subcategoryNames(categories), [categories]);
  const members = [...memberNames.entries()];
  const filtered = filter.doneBy !== null || filter.categoryId !== null || filter.subcategoryName !== null;

  async function onAgain(m: Memo) {
    setAgain((s) => new Set(s).add(m.id));
    if (!(await buyAgain(m)))
      setAgain((s) => {
        const next = new Set(s);
        next.delete(m.id);
        return next;
      });
  }

  return (
    <div className="bought min-h-full pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
      <header className="app-top sticky top-0 z-10 border-b border-line bg-bg/95 px-2 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2 backdrop-blur">
        {/* PC では中身と同じ幅にそろえる */}
        <div className="mx-auto max-w-[calc(42rem+1rem)] space-y-2">
          <div className="flex items-center gap-1">
            <button type="button" className="icon-btn" aria-label="一覧に戻る" onClick={goBack}>
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="text-lg font-bold">買ったもの</h1>
          </div>
          <div className="scroll-x gap-1.5 px-2" role="group" aria-label="買った人で絞り込む">
            <button type="button" className="chip min-h-8 shrink-0 px-3 text-[13px]" aria-pressed={filter.doneBy === null} onClick={() => setFilter({ ...filter, doneBy: null })}>
              みんな
            </button>
            {members.map(([id, name]) => (
              <button key={id} type="button" className="chip min-h-8 shrink-0 px-3 text-[13px]" aria-pressed={filter.doneBy === id} onClick={() => setFilter({ ...filter, doneBy: id })}>
                {name}
              </button>
            ))}
            <CategoryFilterSelect value={filter} onChange={(v) => setFilter({ ...filter, ...v })} categories={categories} subNames={subNames} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        {!ready && <p className="py-10 text-center text-sm text-ink-3">読み込み中…</p>}
        {ready && days.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Oru anim={filtered ? 'think' : 'idle'} size={84} />
            <p className="text-sm text-ink-2">{filtered ? '当てはまる買ったものはありません' : 'まだ買ったものはありません'}</p>
          </div>
        )}
        {days.map((d) => (
          <section key={d.date} className="bought-day">
            <h2 className="mx-1 mt-5 mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-bold text-ink-2">{dayLabel(d.date, today)}</span>
              <span className="text-xs text-ink-3">
                {d.memos.length}件{d.total !== null && `・${priceText(d.total)}`}
              </span>
            </h2>
            <div className="memo-list">
              {d.memos.map((m) => {
                const category = m.categoryId ? categoryMap.get(m.categoryId) : undefined;
                const sub = category?.subcategories.find((s) => s.id === m.subcategoryId);
                const meta = [
                  m.doneBy ? memberNames.get(m.doneBy) : undefined,
                  new Date(m.doneAt!).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
                  m.price !== null ? priceText(m.price) : undefined,
                ]
                  .filter(Boolean)
                  .join('・');
                const done = again.has(m.id);
                return (
                  <div key={m.id} className="bought-row memo-card flex items-center gap-2.5 pr-2 pl-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3" aria-hidden="true">
                      <Check className="size-3 stroke-[3]" />
                    </span>
                    <button type="button" className="flex min-h-13 min-w-0 flex-1 flex-col items-start justify-center gap-1 py-2 text-left" onClick={() => navigate(`/m/${m.id}`)}>
                      <span className="memo-title block font-medium [overflow-wrap:anywhere] line-clamp-2">{m.title}</span>
                      <span className="flex max-w-full min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                        {category && <CategoryBadge category={category} subcategoryName={sub?.name} />}
                        <span className="shrink-0 text-xs text-ink-3">{meta}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={clsx('chip min-h-9 shrink-0 gap-1 px-3 text-xs', done && 'opacity-60')}
                      aria-label={`「${m.title}」をもう一度欲しいものに入れる`}
                      disabled={done}
                      onClick={() => void onAgain(m)}
                    >
                      {done ? <Check className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                      {done ? '入れた' : 'もう一度'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
