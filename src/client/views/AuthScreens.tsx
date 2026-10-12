// Kakeibo の src/client/views/AuthScreens.tsx から（Kakeibo 側で直したら合わせる）
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api';
import { defaultDeviceName } from '../lib/device';

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.name === 'NotAllowedError') return 'パスキーの操作がキャンセルされました';
  return '処理に失敗しました。もう一度お試しください';
}

function ErrorBox({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">{children}</p>;
}

function AuthLayout({ title, subtitle, children }: { title: ReactNode; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-start justify-center px-4 pt-[calc(env(safe-area-inset-top,0px)+64px)] pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:items-center sm:pt-6">
      <div className="w-full max-w-sm">
        <img src="/icons/icon-192.png" alt="" className="mb-6 size-14 rounded-xl" />
        <h1 className="display-num text-[28px] leading-[1.35] [overflow-wrap:anywhere] [word-break:keep-all]">{title}</h1>
        <p className="mt-3 mb-7 text-[15px] text-ink-2">{subtitle}</p>
        <div className="card space-y-4 p-6">{children}</div>
      </div>
    </div>
  );
}

/** 見出しの1語を淡いオレンジの丸い帯で強調する */
function Highlight({ children }: { children: ReactNode }) {
  return <span className="mx-0.5 inline-block rounded-full bg-brand-soft-2 px-3 py-0.5">{children}</span>;
}

export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        パスキーを使えなくなったとき（端末の紛失など）にログインするためのコードです。
        <strong className="text-ink">この画面を閉じると二度と表示されません。</strong>
        紙に書き写すか、パスワード管理アプリに保存してください。各コードは1回だけ使えます。
      </p>
      <div aria-label="リカバリーコード" className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface-2 p-4 font-mono text-[15px] tracking-wider select-all">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-[#cc4a0b]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        コードを安全な場所に保存しました
      </label>
      <button type="button" className="btn btn-primary w-full" disabled={!confirmed} onClick={onDone}>
        続ける
      </button>
    </div>
  );
}

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const options = await api.setupOptions(token, name);
      const response = await startRegistration({ optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'] });
      const result = await api.setupVerify(response, name, defaultDeviceName());
      setCodes(result.recoveryCodes);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    return (
      <AuthLayout title="リカバリーコード" subtitle="万一のときのために控えておいてください。">
        <RecoveryCodes codes={codes} onDone={onDone} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={<>はじめての<Highlight>セットアップ</Highlight></>} subtitle="この端末のパスキーを登録して始めます。">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="label" htmlFor="setup-token">
            セットアップ用トークン
          </label>
          <input id="setup-token" className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label className="label" htmlFor="setup-name">
            表示名
          </label>
          <input id="setup-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="例: りく" required />
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button className="btn btn-primary w-full" disabled={busy}>
          <Fingerprint className="size-5" />
          {busy ? '処理中…' : 'パスキーを登録して始める'}
        </button>
        <p className="flex items-start gap-1.5 text-xs text-ink-3">
          <ShieldCheck className="mt-px size-4 shrink-0" />
          Face ID / Touch ID などでログインします。パスワードは使いません。2人目からは、設定の招待リンクで登録します。
        </p>
      </form>
    </AuthLayout>
  );
}

export function LoginScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'passkey' | 'recovery'>('passkey');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loginWithPasskey() {
    setBusy(true);
    setError(null);
    try {
      const options = await api.loginOptions();
      const response = await startAuthentication({ optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
      await api.loginVerify(response);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function loginWithRecovery(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { remaining } = await api.recover(code);
      window.alert(`リカバリーコードでログインしました（残り ${remaining} 個）。設定画面から新しいパスキーを登録してください。`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={<>欲しいものを、<Highlight>その場で</Highlight>メモ。</>} subtitle="2人のメモにログインします。">
      {mode === 'passkey' ? (
        <>
          <button type="button" className="btn btn-primary w-full" onClick={loginWithPasskey} disabled={busy}>
            <Fingerprint className="size-5" />
            {busy ? '確認中…' : 'パスキーでログイン'}
          </button>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => (setMode('recovery'), setError(null))}>
            パスキーを使えない場合
          </button>
        </>
      ) : (
        <form onSubmit={loginWithRecovery} className="space-y-4">
          <div className="space-y-1.5">
            <label className="label" htmlFor="recovery-code">
              リカバリーコード
            </label>
            <input id="recovery-code" className="input font-mono tracking-wider" autoComplete="off" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" required />
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button className="btn btn-primary w-full" disabled={busy}>
            <KeyRound className="size-5" />
            ログイン
          </button>
          <button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => (setMode('passkey'), setError(null))}>
            パスキーでログインする
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

/** 招待リンクから開いたときの登録画面 */
export function InviteScreen({ token, loggedInAs, onDone, onLogout }: { token: string; loggedInAs: string | null; onDone: () => void; onLogout: () => void }) {
  const [state, setState] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [checkError, setCheckError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (loggedInAs) return;
    api.inviteCheck(token).then(
      (r) => (setExpiresAt(r.expiresAt), setState('valid')),
      (e) => (setCheckError(errorMessage(e)), setState('invalid')),
    );
  }, [token, loggedInAs]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const options = await api.inviteOptions(token, name);
      const response = await startRegistration({ optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'] });
      const result = await api.inviteVerify(response, name, defaultDeviceName());
      setCodes(result.recoveryCodes);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loggedInAs) {
    return (
      <AuthLayout title="招待リンク" subtitle={`この端末では「${loggedInAs}」としてログイン中です。`}>
        <p className="text-sm text-ink-2">招待を受けるには、招待された本人の端末で開くか、いったんログアウトしてください。</p>
        <button type="button" className="btn btn-primary w-full" onClick={onLogout}>
          ログアウトして招待を受ける
        </button>
        <button type="button" className="btn btn-ghost btn-sm w-full" onClick={onDone}>
          招待を受けずに戻る
        </button>
      </AuthLayout>
    );
  }
  if (codes) {
    return (
      <AuthLayout title="リカバリーコード" subtitle="万一のときのために控えておいてください。">
        <RecoveryCodes codes={codes} onDone={onDone} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={<>メモに<Highlight>招待</Highlight>されています</>} subtitle="招待した人と同じメモを一緒に使います。どちらが書いても2人に見えます。">
      {state === 'checking' && <p className="text-sm text-ink-3">招待を確認しています…</p>}
      {state === 'invalid' && (
        <>
          <ErrorBox>{checkError}</ErrorBox>
          <p className="text-sm text-ink-2">招待した人に、新しいリンクを発行してもらってください。</p>
          <button type="button" className="btn w-full" onClick={onDone}>
            ログイン画面へ
          </button>
        </>
      )}
      {state === 'valid' && (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="label" htmlFor="invite-name">
              表示名
            </label>
            <input id="invite-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="例: はなこ" required />
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button className="btn btn-primary w-full" disabled={busy}>
            <Fingerprint className="size-5" />
            {busy ? '処理中…' : 'パスキーを登録して始める'}
          </button>
          {expiresAt && (
            <p className="text-xs text-ink-3">
              このリンクの有効期限：{new Date(expiresAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}（1回だけ使えます）
            </p>
          )}
        </form>
      )}
    </AuthLayout>
  );
}

