import { useCallback, useState } from 'react';
import { todayJst } from '../../shared/date';
import { Oru } from '../components/Oru';
import { OruCameo } from '../components/OruCameo';
import { useAppData } from '../data';
import { computeOruFacts } from '../lib/facts';
import { useMediaQuery } from '../lib/hooks';
import type { ListFilter } from '../lib/list';
import { loadShowDone, loadViewMode, type ViewMode } from '../lib/prefs';
import { useRoute } from '../lib/router';
import { HomeView } from './HomeView';
import { MemoDetail } from './MemoDetail';
import { SettingsView } from './SettingsView';

/**
 * 画面の切り替え。スマホは一覧・詳細・設定を1画面ずつ、PC（1024px〜）は左に一覧、右に選んだメモの詳細を出す。
 * 絞り込みと並べ方はここで持ち、詳細から戻っても変わらないようにする
 */
export function AppShell({ onLoggedOut }: { onLoggedOut: () => void }) {
  const route = useRoute();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const { memos, categoryMap } = useAppData();
  const [filter, setFilter] = useState<ListFilter>(() => ({ showDone: loadShowDone(), categoryId: null, q: '' }));
  const [mode, setMode] = useState<ViewMode>(loadViewMode);
  const today = todayJst();
  const facts = useCallback(() => computeOruFacts(memos, categoryMap, today), [memos, categoryMap, today]);

  const home = (selectedId: string | null) => (
    <HomeView filter={filter} onFilter={setFilter} mode={mode} onMode={setMode} selectedId={selectedId} desktop={desktop} />
  );

  let page;
  if (route.name === 'settings') {
    page = <SettingsView onLoggedOut={onLoggedOut} />;
  } else if (desktop) {
    const selected = route.name === 'memo' ? route.id : null;
    page = (
      <div className="grid h-dvh grid-cols-[minmax(380px,440px)_1fr]">
        <aside className="overflow-y-auto border-r border-line">{home(selected)}</aside>
        <main className="overflow-y-auto">
          {selected ? (
            <MemoDetail key={selected} id={selected} desktop />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-ink-3">
              <Oru anim="idle" size={96} />
              メモを選ぶと、ここに詳しく出ます
            </div>
          )}
        </main>
      </div>
    );
  } else {
    page = route.name === 'memo' ? <MemoDetail key={route.id} id={route.id} desktop={false} /> : home(null);
  }

  // おるは、スマホの一覧では入力欄の少し上、それ以外は画面の右下に出す
  const oruBottom = !desktop && route.name === 'home' ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+124px)]' : 'bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] lg:bottom-6';
  return (
    <>
      {page}
      <OruCameo today={today} facts={facts} bottomClass={oruBottom} />
    </>
  );
}
