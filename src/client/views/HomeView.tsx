import clsx from 'clsx';
import { ChevronDown, Search, Settings, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cheapestPrice } from '../../shared/memo';
import { DoneCheck } from '../components/DoneCheck';
import { Oru } from '../components/Oru';
import { TagIcon } from '../components/TagIcon';
import { useAppData } from '../data';
import { useKeyboardInset } from '../lib/keyboard';
import { buildSections, type ListFilter, type ListRow } from '../lib/list';
import { priceText } from '../lib/format';
import { saveViewMode, type ViewMode } from '../lib/prefs';
import { navigate } from '../lib/router';
import { QuickAdd } from './QuickAdd';

/** チップの見た目の選択欄（iPhone では下からの選択肢が出る） */
function ChipSelect({ label, value, active, onChange, children }: { label: string; value: string; active: boolean; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <span className="relative shrink-0">
      <select
        className={clsx('chip appearance-none pr-8', active && 'border-transparent bg-brand-soft-2 font-semibold text-ink')}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 opacity-60" />
    </span>
  );
}

/** スマホで詳細から戻ったときに、一覧の同じ位置へ戻すためのスクロール位置 */
let savedScroll = 0;

/** 一覧の1行に出す値段（「購入先ごと」ならその店の値段、そうでなければいちばん安い値段） */
function rowPrice(row: ListRow): string | null {
  if (row.storeId) {
    const p = row.memo.offers.find((o) => o.storeId === row.storeId)?.price;
    return p == null ? null : priceText(p);
  }
  const min = cheapestPrice(row.memo.offers);
  if (min === null) return null;
  const priced = row.memo.offers.filter((o) => o.price !== null).length;
  return priced > 1 ? `${priceText(min)}〜` : priceText(min);
}

function MemoRow({ row, mode, selected }: { row: ListRow; mode: ViewMode; selected: boolean }) {
  const { storeMap, genreMap, toggleDone } = useAppData();
  const m = row.memo;
  const pending = m.id.startsWith('tmp-');
  const genre = m.genreId ? genreMap.get(m.genreId) : undefined;
  const stores = m.offers.map((o) => storeMap.get(o.storeId)).filter((s) => s !== undefined);
  const price = rowPrice(row);
  const firstLine = m.body.split('\n').find((l) => l.trim());
  const meta = [
    mode === 'recent' && genre?.name,
    mode === 'recent' && stores.length > 0 && (stores.length === 1 ? stores[0]!.name : `${stores[0]!.name} ほか${stores.length - 1}件`),
    mode === 'store' && stores.length > 1 && `ほかに ${stores.filter((s) => s.id !== row.storeId).map((s) => s.name).join('・')}`,
  ].filter(Boolean);
  return (
    <div className={clsx('memo-row flex items-start gap-2 py-2.5 pr-2 pl-3 transition-colors', selected && 'bg-brand-soft', pending && 'opacity-60')}>
      <div className="pt-0.5">
        <DoneCheck done={m.doneAt !== null} title={m.title} onChange={(done) => !pending && toggleDone(m, done)} />
      </div>
      <button
        type="button"
        className="flex min-h-11 min-w-0 flex-1 items-start gap-3 py-1 text-left"
        disabled={pending}
        onClick={() => navigate(`/m/${m.id}`)}
        aria-current={selected ? 'page' : undefined}
      >
        <span className="min-w-0 flex-1">
          <span className={clsx('block font-medium [overflow-wrap:anywhere] line-clamp-2', m.doneAt && 'text-ink-3 line-through decoration-ink-3/40')}>{m.title}</span>
          {meta.length > 0 && <span className="mt-0.5 block truncate text-xs text-ink-3">{meta.join(' ・ ')}</span>}
          {mode === 'genre' && m.offers.length > 0 && (
            <span className="mt-0.5 block truncate text-xs text-ink-2">
              {m.offers
                .map((o) => {
                  const s = storeMap.get(o.storeId);
                  return s ? `${s.name}${o.price !== null ? ` ${priceText(o.price)}` : ''}` : null;
                })
                .filter(Boolean)
                .join(' ・ ')}
            </span>
          )}
          {firstLine && <span className="mt-0.5 block truncate text-xs text-ink-3">{firstLine}</span>}
        </span>
        {price && mode !== 'genre' && <span className="amount shrink-0 pt-0.5 text-sm">{price}</span>}
      </button>
    </div>
  );
}

interface Props {
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  selectedId: string | null;
  /** PC の2カラム（左に一覧）のとき */
  desktop: boolean;
}

export function HomeView({ filter, onFilter, mode, onMode, selectedId, desktop }: Props) {
  const { memos, stores, genres, ready, loadError, reload } = useAppData();
  const [searching, setSearching] = useState(filter.q !== '');
  const keyboard = useKeyboardInset();
  const searchRef = useRef<HTMLInputElement>(null);

  // スマホで詳細から戻ったときに、前のスクロール位置へ戻す
  useLayoutEffect(() => {
    if (desktop) return;
    window.scrollTo(0, savedScroll);
    return () => {
      savedScroll = window.scrollY;
    };
  }, [desktop]);

  const sections = useMemo(() => buildSections(memos, filter, mode, stores, genres), [memos, filter, mode, stores, genres]);
  const counts = useMemo(() => ({ open: memos.filter((m) => !m.doneAt).length, done: memos.filter((m) => m.doneAt).length }), [memos]);
  const filtered = filter.storeId !== null || filter.genreId !== null || filter.q.trim() !== '';

  return (
    <div className={clsx('home', desktop ? 'flex min-h-full flex-col' : 'pb-[calc(env(safe-area-inset-bottom,0px)+150px)]')}>
      <header className="app-top sticky top-0 z-10 space-y-2.5 border-b border-line bg-bg/95 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3 backdrop-blur">
        <div className="flex items-center gap-1">
          <img src="/icons/icon-192.png?v=1" alt="" className="mr-1 size-8 rounded-lg" />
          <h1 className="flex-1 text-xl font-bold">2人のメモ</h1>
          <button
            type="button"
            className="icon-btn"
            aria-label="さがす"
            aria-pressed={searching}
            onClick={() => {
              if (searching) onFilter({ ...filter, q: '' });
              setSearching(!searching);
              if (!searching) window.setTimeout(() => searchRef.current?.focus(), 0);
            }}
          >
            {searching ? <X className="size-5" /> : <Search className="size-5" />}
          </button>
          <button type="button" className="icon-btn" aria-label="設定" onClick={() => navigate('/settings')}>
            <Settings className="size-5" />
          </button>
        </div>
        {searching && (
          <input
            ref={searchRef}
            className="input min-h-10"
            type="search"
            placeholder="名前・詳細メモからさがす"
            aria-label="さがす"
            value={filter.q}
            onChange={(e) => onFilter({ ...filter, q: e.target.value })}
          />
        )}
        <div className="segmented" role="group" aria-label="表示するメモ">
          <button type="button" aria-pressed={filter.state === 'open'} onClick={() => onFilter({ ...filter, state: 'open' })}>
            欲しい <span className="ml-0.5 text-xs opacity-70">{counts.open}</span>
          </button>
          <button type="button" aria-pressed={filter.state === 'done'} onClick={() => onFilter({ ...filter, state: 'done' })}>
            買ったもの <span className="ml-0.5 text-xs opacity-70">{counts.done}</span>
          </button>
        </div>
        <div className="scroll-x">
          <ChipSelect
            label="並べ方"
            value={mode}
            active={false}
            onChange={(v) => {
              saveViewMode(v as ViewMode);
              onMode(v as ViewMode);
            }}
          >
            <option value="recent">新しい順</option>
            <option value="store">購入先ごと</option>
            <option value="genre">ジャンルごと</option>
          </ChipSelect>
          <ChipSelect label="購入先で絞り込む" value={filter.storeId ?? ''} active={filter.storeId !== null} onChange={(v) => onFilter({ ...filter, storeId: v || null })}>
            <option value="">購入先：すべて</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </ChipSelect>
          <ChipSelect label="ジャンルで絞り込む" value={filter.genreId ?? ''} active={filter.genreId !== null} onChange={(v) => onFilter({ ...filter, genreId: v || null })}>
            <option value="">ジャンル：すべて</option>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </ChipSelect>
        </div>
      </header>

      {desktop && (
        <div className="border-b border-line p-3">
          <QuickAdd filterStoreId={filter.storeId} filterGenreId={filter.genreId} docked={false} />
        </div>
      )}

      <div className={clsx('px-4 pt-3', desktop && 'flex-1 pb-6')}>
        {loadError && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">
            <span className="flex-1">{loadError}</span>
            <button type="button" className="btn btn-sm" onClick={() => void reload()}>
              読み直す
            </button>
          </div>
        )}
        {!ready && <p className="py-10 text-center text-sm text-ink-3">読み込み中…</p>}
        {ready && sections.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Oru anim={filtered ? 'think' : 'idle'} size={84} />
            {filtered ? (
              <>
                <p className="text-sm text-ink-2">当てはまるメモがありません</p>
                <button type="button" className="btn btn-sm" onClick={() => onFilter({ ...filter, storeId: null, genreId: null, q: '' })}>
                  絞り込みをやめる
                </button>
              </>
            ) : filter.state === 'done' ? (
              <p className="text-sm text-ink-2">
                買ったものはまだありません。
                <br />
                買ったら、メモのチェックを押してね
              </p>
            ) : (
              <p className="text-sm text-ink-2">
                まだメモがありません。
                <br />
                {desktop ? '上' : '下'}の欄に、欲しいものを書いてみよう
              </p>
            )}
          </div>
        )}
        {sections.map((s) => (
          <section key={s.key} className="memo-section mb-4">
            {s.title && (
              <h2 className="mx-1 mt-2 mb-2 flex items-center gap-2 text-sm font-semibold text-ink-2">
                {s.tag && <TagIcon icon={s.tag.icon} color={s.tag.color} size="sm" />}
                <span className="flex-1">{s.title}</span>
                <span className="text-xs font-normal text-ink-3">{s.count}件</span>
              </h2>
            )}
            {s.groups.map((g) => (
              <div key={g.key}>
                {g.title && <h3 className="mx-1 mt-2 mb-1 text-xs font-medium text-ink-3">{g.title}</h3>}
                <div className="card divide mb-2 overflow-hidden">
                  {g.rows.map((row) => (
                    <MemoRow key={`${row.memo.id}:${row.storeId ?? ''}`} row={row} mode={mode} selected={row.memo.id === selectedId} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {!desktop && (
        <QuickAdd filterStoreId={filter.storeId} filterGenreId={filter.genreId} docked style={keyboard ? { bottom: keyboard, paddingBottom: 12 } : undefined} />
      )}
    </div>
  );
}
