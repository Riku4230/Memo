import clsx from 'clsx';
import { CheckCheck, ChevronRight, History, Search, Settings, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { todayJst } from '../../shared/date';
import type { Memo } from '../../shared/types';
import { CategoryBadge } from '../components/CategoryBadge';
import { CategoryFilterSelect, ChipSelect } from '../components/ChipSelect';
import { DoneCheck } from '../components/DoneCheck';
import { Oru } from '../components/Oru';
import { TagIcon } from '../components/TagIcon';
import { useAppData } from '../data';
import { useKeyboardInset } from '../lib/keyboard';
import { boughtToday, buildSections, norm, subcategoryNames, type ListFilter } from '../lib/list';
import { priceText } from '../lib/format';
import { saveViewMode, type ViewMode } from '../lib/prefs';
import { navigate } from '../lib/router';
import { QuickAdd } from './QuickAdd';

/** 一覧を開いているあいだ、相手の変更がないか確かめる間隔 */
const SYNC_INTERVAL_MS = 15_000;

/** スマホで詳細から戻ったときに、一覧の同じ位置へ戻すためのスクロール位置 */
let savedScroll = 0;

/** showBadge: 行にカテゴリのラベルを出すか（「カテゴリごと」では見出しで分かるので出さない） */
function MemoRow({ memo: m, showBadge, selected }: { memo: Memo; showBadge: boolean; selected: boolean }) {
  const { categoryMap, memberNames, toggleDone } = useAppData();
  const pending = m.id.startsWith('tmp-');
  const category = m.categoryId ? categoryMap.get(m.categoryId) : undefined;
  const sub = category?.subcategories.find((s) => s.id === m.subcategoryId);
  const firstLine = m.body.split('\n').find((l) => l.trim());
  // 今日買ったものは、その場に点線のブロックで残し、誰がいつ買ったかを出す（間違えたら「取り消す」）
  const got = m.doneAt !== null;
  let boughtLine: string | null = null;
  if (got) {
    const time = new Date(m.doneAt!).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const who = m.doneBy ? memberNames.get(m.doneBy) : undefined;
    boughtLine = who ? `${time} ${who}が買った` : `${time}に買った`;
  }
  return (
    // 名前だけのメモは1行の高さ（48px）に収め、チェックと名前を縦の真ん中でそろえる
    <div className={clsx('memo-row memo-card flex items-start gap-1.5 pr-3 pl-2', got && 'is-got', selected && 'is-selected', pending && 'opacity-60')}>
      <div className="flex h-12 shrink-0 items-center">
        <DoneCheck done={m.doneAt !== null} title={m.title} onChange={(done) => !pending && toggleDone(m, done)} />
      </div>
      <button
        type="button"
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
        disabled={pending}
        onClick={() => navigate(`/m/${m.id}`)}
        aria-current={selected ? 'page' : undefined}
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className={clsx('memo-title block font-medium [overflow-wrap:anywhere] line-clamp-2', m.doneAt && 'text-ink-3 line-through decoration-ink-3/40')}>{m.title}</span>
          {showBadge && category && <CategoryBadge category={category} subcategoryName={sub?.name} />}
          {boughtLine ? (
            <span className="bought-line -mt-0.5 block w-full truncate text-xs text-ink-3">{boughtLine}</span>
          ) : (
            firstLine && <span className="-mt-0.5 block w-full truncate text-xs text-ink-3">{firstLine}</span>
          )}
        </span>
        {m.price !== null && <span className="amount shrink-0 self-start pt-0.5 text-[13px] font-medium text-ink-3">{priceText(m.price)}</span>}
      </button>
      {got && (
        <div className="flex h-12 shrink-0 items-center">
          <button type="button" className="undo-done -mr-1 min-h-10 rounded-full px-2.5 text-xs font-medium text-brand hover:bg-brand-soft" aria-label={`「${m.title}」の買ったを取り消す`} onClick={() => toggleDone(m, false)}>
            取り消す
          </button>
        </div>
      )}
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
  const { memos, categories, ready, loadError, reload, checkForChanges } = useAppData();
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

  // ホームに戻ってきたときと、ホームを開いているあいだ15秒おきに、相手の変更がないか確かめる（変わっていたときだけ読み直す）
  useEffect(() => {
    void checkForChanges();
    const timer = window.setInterval(() => void checkForChanges(), SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkForChanges]);

  const today = todayJst();
  const sections = useMemo(() => buildSections(memos, filter, mode, categories, today), [memos, filter, mode, categories, today]);
  const doneCount = useMemo(() => memos.filter((m) => m.doneAt).length, [memos]);
  const todayCount = useMemo(() => memos.filter((m) => boughtToday(m, today)).length, [memos, today]);
  // 一覧の上に出す件数（まだ買っていないもののうち、絞り込みに当てはまるもの）
  const openCount = sections.reduce((n, s) => n + s.count, 0);
  const filtered = filter.categoryId !== null || filter.subcategoryName !== null || filter.q.trim() !== '';
  const subNames = useMemo(() => subcategoryNames(categories), [categories]);
  // すぐ登録のカテゴリの初めの値：大カテゴリで絞っていればその大カテゴリ。中カテゴリで絞っていて、その名前の中カテゴリが1つだけならそれ
  const quickPreset = useMemo(() => {
    if (filter.categoryId) return { categoryId: filter.categoryId, subcategoryId: null };
    if (filter.subcategoryName) {
      const key = norm(filter.subcategoryName);
      const hits = categories.flatMap((c) => c.subcategories.filter((sc) => norm(sc.name) === key).map((sc) => ({ categoryId: c.id, subcategoryId: sc.id })));
      if (hits.length === 1) return hits[0]!;
    }
    return { categoryId: null, subcategoryId: null };
  }, [filter.categoryId, filter.subcategoryName, categories]);

  return (
    <div className={clsx('home', desktop ? 'flex min-h-full flex-col' : 'pb-[calc(env(safe-area-inset-bottom,0px)+150px)]')}>
      <header className="app-top sticky top-0 z-10 space-y-2.5 border-b border-line bg-bg/95 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3 backdrop-blur">
        <div className="flex items-center gap-2">
          {/* 左上の丸：買ったものの履歴を開く（今日買ったものは一覧のその場に残っている） */}
          <button
            type="button"
            className="show-done flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-3 transition hover:bg-surface-2"
            aria-label="買ったものの履歴"
            title="買ったものの履歴"
            onClick={() => navigate('/bought')}
          >
            <CheckCheck className="size-5" />
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
        <div className="scroll-x -mx-2 gap-1">
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
          <CategoryFilterSelect
            value={filter}
            onChange={(v) => onFilter({ ...filter, ...v })}
            categories={categories}
            subNames={subNames}
          />
        </div>
      </header>

      {desktop && (
        <div className="border-b border-line p-3">
          <QuickAdd preset={quickPreset} docked={false} />
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
                <button type="button" className="btn btn-sm" onClick={() => onFilter({ ...filter, categoryId: null, subcategoryName: null, q: '' })}>
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
        {ready && openCount > 0 && (
          <p className="list-count mx-1 mb-2 text-xs text-ink-3">
            {filtered ? `${openCount}件` : `全${openCount}件`}
          </p>
        )}
        {/* 大カテゴリのあいだは広く、同じ大カテゴリの中は狭くあけて、まとまりを見せる */}
        <div className="flex flex-col gap-7">
          {sections.map((s) => (
            <section key={s.key} className="memo-section">
              {s.title && (
                <h2 className="list-heading">
                  {s.category && <TagIcon icon={s.category.icon} color={s.category.color} size="sm" />}
                  <span className="section-name min-w-0 truncate">{s.title}</span>
                  <span className="shrink-0 text-xs font-normal tracking-normal text-ink-3">{s.hasBought ? `残り${s.count}件` : `${s.count}件`}</span>
                </h2>
              )}
              <div className="flex flex-col gap-3">
                {s.groups.map((g) => (
                  <div key={g.key}>
                    {/* 中カテゴリは見出しより小さく、メモの名前より細かい太字にして、すぐ下のメモにくっつける。
                        頭の点は大カテゴリの色（そのほかは灰色）。文字は見出しの名前と同じ位置にそろえ、点は文字のすぐ左に置く */}
                    {g.title && (
                      <h3 className="sub-heading">
                        <span className="flex w-7 shrink-0 justify-end" aria-hidden="true">
                          <span
                            className={clsx('size-1.5 rounded-full', (g.key.endsWith(':none') || !s.category) && 'bg-ink-3/50')}
                            style={!g.key.endsWith(':none') && s.category ? { backgroundColor: s.category.color } : undefined}
                          />
                        </span>
                        <span className="min-w-0 truncate">{g.title}</span>
                      </h3>
                    )}
                    <div className="memo-list">
                      {g.memos.map((m) => (
                        <MemoRow key={m.id} memo={m} showBadge={mode === 'recent'} selected={m.id === selectedId} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {ready && doneCount > 0 && (
            // 一覧のいちばん下に、買ったものの履歴への入口（今日の分と、これまでの分の件数）
            <button type="button" className="bought-link memo-card flex min-h-12 items-center gap-2.5 px-3 text-left text-sm text-ink-2" onClick={() => navigate('/bought')}>
              <History className="size-4.5 shrink-0 text-ink-3" />
              <span className="flex-1 font-medium">買ったものの履歴</span>
              <span className="text-xs text-ink-3">{todayCount > 0 ? `今日${todayCount}件・` : ''}これまで{doneCount}件</span>
              <ChevronRight className="size-4 shrink-0 text-ink-3" />
            </button>
          )}
        </div>
      </div>

      {!desktop && <QuickAdd preset={quickPreset} docked style={keyboard ? { bottom: keyboard, paddingBottom: 12 } : undefined} />}
    </div>
  );
}
