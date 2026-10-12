import { useCallback, useEffect, useState } from 'react';
import type { Me } from '../shared/types';
import { api, setUnauthorizedHandler } from './api';
import { DataProvider } from './data';
import { AppShell } from './views/AppShell';
import { InviteScreen, LoginScreen, SetupScreen } from './views/AuthScreens';

/** 招待リンク（/#invite=トークン）からトークンを取り出し、アドレスバーからは消す */
function takeInviteToken(): string | null {
  const m = window.location.hash.match(/^#invite=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return m[1] ?? null;
}

const LOGGED_OUT: Me = { user: null, members: [], setupRequired: false };

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(takeInviteToken);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.me().then(setMe, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    // 開いたままのタブに招待リンクを貼り付けた場合（# だけが変わりページは再読み込みされない）
    const onHash = () => {
      const token = takeInviteToken();
      if (token) setInviteToken(token);
    };
    window.addEventListener('hashchange', onHash);
    // セッション切れ（401）になったらログイン画面に戻す
    setUnauthorizedHandler(() => setMe((m) => (m ? LOGGED_OUT : m)));
    return () => window.removeEventListener('hashchange', onHash);
  }, [load]);

  if (error) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="card w-full max-w-sm space-y-3 p-6">
          <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>
          <button type="button" className="btn btn-primary w-full" onClick={load}>
            再読み込み
          </button>
        </div>
      </div>
    );
  }
  if (!me) return <div className="flex min-h-full items-center justify-center text-ink-3">読み込み中…</div>;
  if (inviteToken && !me.setupRequired) {
    return (
      <InviteScreen
        token={inviteToken}
        loggedInAs={me.user?.name ?? null}
        onLogout={() => void api.logout().finally(() => setMe(LOGGED_OUT))}
        onDone={() => {
          setInviteToken(null);
          load();
        }}
      />
    );
  }
  if (me.setupRequired) return <SetupScreen onDone={load} />;
  if (!me.user) return <LoginScreen onDone={load} />;
  return (
    <DataProvider key={me.user.id} user={me.user} members={me.members}>
      <AppShell onLoggedOut={() => setMe(LOGGED_OUT)} />
    </DataProvider>
  );
}
