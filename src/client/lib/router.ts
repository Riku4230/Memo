import { useEffect, useState } from 'react';

/** 画面の場所。ルーター用のライブラリは入れず、History API で切り替える（画面が少ないため） */
export type Route = { name: 'home' } | { name: 'memo'; id: string } | { name: 'bought' } | { name: 'settings' };

export function parseRoute(path: string): Route {
  const m = path.match(/^\/m\/([A-Za-z0-9-]{1,64})\/?$/);
  if (m) return { name: 'memo', id: m[1]! };
  if (/^\/settings\/?$/.test(path)) return { name: 'settings' };
  if (/^\/bought\/?$/.test(path)) return { name: 'bought' };
  return { name: 'home' };
}

const EVENT = 'memo:navigate';

/** 画面を移る。replace なら履歴を増やさない（消したメモの画面から一覧へ戻すときなど） */
export function navigate(path: string, replace = false): void {
  if (path === window.location.pathname) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState({ app: true }, '', path);
  window.dispatchEvent(new Event(EVENT));
  window.scrollTo(0, 0);
}

/** 戻る。アプリの中で移ってきたなら履歴を戻り、直接開いたなら一覧へ */
export function goBack(): void {
  if ((window.history.state as { app?: boolean } | null)?.app) window.history.back();
  else navigate('/', true);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return route;
}
