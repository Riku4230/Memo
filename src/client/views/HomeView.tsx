import clsx from 'clsx';
import { CheckCheck, ChevronDown, Search, Settings, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Memo } from '../../shared/types';
import { CategoryBadge } from '../components/CategoryBadge';
import { DoneCheck } from '../components/DoneCheck';
import { Oru } from '../components/Oru';
import { TagIcon } from '../components/TagIcon';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';
import { useKeyboardInset } from '../lib/keyboard';
import { buildSections, type ListFilter } from '../lib/list';
import { priceText } from '../lib/format';
import { saveShowDone, saveViewMode, type ViewMode } from '../lib/prefs';
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

/** showBadge: 行にカテゴリのラベルを出すか（「カテゴリごと」では見出しで分かるので出さない） */
function MemoRow({ memo: m, showBadge, selected }: { memo: Memo; showBadge: boolean; selected: boolean }) {
  const { categoryMap, toggleDone } = useAppData();
  const pending = m.id.startsWith('tmp-');
  const category = m.categoryId ? categoryMap.get(m.categoryId) : undefined;
  const sub = category?.subcategories.find((s) => s.id === m.subcategoryId);
  const firstLine = m.body.split('\n').find((l) => l.trim());
  return (
    <div className={clsx('memo-row flex items-start gap-2 py-2.5 pr-3 pl-3 transition-colors', selected && 'bg-brand-soft', pending && 'opacity-60')}>
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
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className={clsx('block font-medium [overflow-wrap:anywhere] line-clamp-2', m.doneAt && 'text-ink-3 line-through decoration-ink-3/40')}>{m.title}</span>
          {showBadge && category && <CategoryBadge category={category} subcategoryName={sub?.name} />}
          {firstLine && <span className="block w-full truncate text-xs text-ink-3">{firstLine}</span>}
        </span>
        {m.price !== null && <span className="amount shrink-0 pt-0.5 text-sm">{priceText(m.price)}</span>}
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
  const { memos, categories, ready, loadError, reload } = useAppData();
  const toast = useToast();
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

  const sections = useMemo(() => buildSections(memos, filter, mode, categories), [memos, filter, mode, categories]);
  const doneCount = useMemo(() => memos.filter((m) => m.doneAt).length, [memos]);
  const filtered = filter.categoryId !== null || filter.q.trim() !== '';

  return (
    <div className={clsx('home', desktop ? 'flex min-h-full flex-col' : 'pb-[calc(env(safe-area-inset-bottom,0px)+150px)]')}>
      <header className="app-top sticky top-0 z-10 space-y-2.5 border-b border-line bg-bg/95 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3 backdrop-blur">
        <div className="flex items-center gap-2">
          {/* 左上の丸：買ったものも一覧に出す（ふだんは欲しいものだけ） */}
          <button
            type="button"
            className={clsx(
              'show-done relative flex size-10 shrink-0 items-center justify-center rounded-full border transition',
              filter.showDone ? 'border-transparent bg-brand-strong text-white' : 'border-line bg-surface text-ink-3 hover:bg-surface-2',
            )}
            aria-pressed={filter.showDone}
            aria-label="買ったものも表示"
            title="買ったものも表示"
            onClick={() => {
              const on = !filter.showDone;
              saveShowDone(on);
              onFilter({ ...filter, showDone: on });
              toast(on ? '買ったものも表示します' : '欲しいものだけにしました');
            }}
          >
            <CheckCheck className="size-5" />
            {doneCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 rounded-full border-2 border-bg bg-ink-3 px-1 text-center text-[10px] leading-4 font-bold text-bg">
                {doneCount}
              </span>
            )}
          </button>
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
            <option value="category">カテゴリごと</option>
          </ChipSelect>
          <ChipSelect label="カテゴリで絞り込む" value={filter.categoryId ?? ''} active={filter.categoryId !== null} onChange={(v) => onFilter({ ...filter, categoryId: v || null })}>
            <option value="">カテゴリ：すべて</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </ChipSelect>
        </div>
      </header>

      {desktop && (
        <div className="border-b border-line p-3">
          <QuickAdd filterCategoryId={filter.categoryId} docked={false} />
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
                <button type="button" className="btn btn-sm" onClick={() => onFilter({ ...filter, categoryId: null, q: '' })}>
                  絞り込みをやめる
                </button>
              </>
            ) : (
              <p className="text-sm text-ink-2">
                {doneCount > 0 ? '欲しいものは全部買えたね。' : 'まだメモがありません。'}
                <br />
                {desktop ? '上' : '下'}の欄に、欲しいものを書いてみよう
              </p>
            )}
          </div>
        )}
        {sections.map((s) => (
          <section key={s.key} className={clsx('memo-section mb-4', s.done && 'done-section')}>
            {s.title && (
              <h2 className="mx-1 mt-2 mb-2 flex items-center gap-2 text-sm font-semibold text-ink-2">
                {s.category && <TagIcon icon={s.category.icon} color={s.category.color} size="sm" />}
                {s.done && (
                  <span className="flex size-7 items-center justify-center rounded-lg bg-surface-2 text-ink-3">
                    <CheckCheck className="size-4" />
                  </span>
                )}
                <span className="flex-1">{s.title}</span>
                <span className="text-xs font-normal text-ink-3">{s.count}件</span>
              </h2>
            )}
            {s.groups.map((g) => (
              <div key={g.key}>
                {g.title && <h3 className="mx-1 mt-2 mb-1 text-xs font-medium text-ink-3">{g.title}</h3>}
                <div className="card divide mb-2 overflow-hidden">
                  {g.memos.map((m) => (
                    <MemoRow key={m.id} memo={m} showBadge={mode === 'recent' || s.done} selected={m.id === selectedId} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {!desktop && <QuickAdd filterCategoryId={filter.categoryId} docked style={keyboard ? { bottom: keyboard, paddingBottom: 12 } : undefined} />}
    </div>
  );
}
