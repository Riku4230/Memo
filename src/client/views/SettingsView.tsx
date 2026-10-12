import { startRegistration } from '@simplewebauthn/browser';
import clsx from 'clsx';
import { ArrowLeft, ChevronRight, Download, Fingerprint, KeyRound, LogOut, Plus, Tags } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api, errorText } from '../api';
import { Oru } from '../components/Oru';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';
import { defaultDeviceName } from '../lib/device';
import { formatDateTime } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { oruEnabled, setOruEnabled } from '../lib/oru';
import { goBack } from '../lib/router';
import { setThemeChoice, themeChoice, type ThemeChoice } from '../lib/theme';
import { RecoveryCodes } from './AuthScreens';
import { MembersSection } from './MembersSection';
import { CategoryManager } from './CategoryManager';

function IconBadge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-[10px]', className ?? 'bg-brand-soft text-brand')}>{children}</span>;
}

const SWITCH =
  'relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition before:absolute before:top-0.5 before:left-0.5 before:size-6 before:rounded-full before:bg-white before:shadow before:transition checked:bg-brand-strong checked:before:translate-x-5';

export function SettingsView({ onLoggedOut }: { onLoggedOut: () => void }) {
  const { user, categories } = useAppData();
  const toast = useToast();
  const passkeys = useAsync(() => api.passkeys(), []);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeChoice>(themeChoice);
  const [oru, setOru] = useState(oruEnabled);
  const [manage, setManage] = useState(false);

  async function run(fn: () => Promise<unknown>, message?: string) {
    setError(null);
    try {
      await fn();
      if (message) toast(message);
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === 'NotAllowedError') setError('パスキーの操作がキャンセルされました');
      else setError(errorText(e));
      return false;
    }
  }

  async function addPasskey() {
    const name = window.prompt('この端末の名前', defaultDeviceName());
    if (!name) return;
    const ok = await run(async () => {
      const options = await api.passkeyOptions();
      const response = await startRegistration({ optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'] });
      await api.passkeyVerify(response, name.slice(0, 40));
    }, 'パスキーを追加しました');
    if (ok) passkeys.reload();
  }

  async function logout(all: boolean) {
    if (all && !window.confirm('この端末を含む、すべての端末からログアウトしますか？')) return;
    // サーバー側でログアウトできなかった場合は、ログアウトしたように見せない
    if (!(await run(() => (all ? api.logoutAll() : api.logout())))) return;
    // 画面の外枠のキャッシュも消す
    navigator.serviceWorker?.controller?.postMessage('clear-cache');
    onLoggedOut();
  }

  return (
    <div className="settings min-h-full pb-[calc(env(safe-area-inset-bottom,0px)+32px)]">
      <header className="app-top sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-bg/95 px-2 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2 backdrop-blur">
        <button type="button" className="icon-btn" aria-label="一覧に戻る" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-bold">設定</h1>
      </header>
      <div className="mx-auto max-w-2xl px-4 pt-4">
        <div className="card flex items-center gap-3 p-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-lg font-bold text-brand">{user.name.slice(0, 1)}</span>
          <div>
            <div className="text-lg font-bold">{user.name}</div>
            <div className="text-xs text-ink-3">{user.role === 'owner' ? '管理者としてログイン中' : 'ログイン中'}</div>
          </div>
        </div>
        {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}

        <h2 className="section-title">カテゴリ</h2>
        <div className="card divide overflow-hidden">
          <button type="button" className="row-item hover:bg-surface-2/60" onClick={() => setManage(true)}>
            <IconBadge>
              <Tags className="size-5" />
            </IconBadge>
            <span className="flex-1">カテゴリの管理</span>
            <span className="text-sm text-ink-3">{categories.length}件</span>
            <ChevronRight className="size-5 text-ink-3" />
          </button>
        </div>

        <h2 className="section-title">表示（この端末だけ）</h2>
        <div className="card divide overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm">画面の明るさ</span>
            <div className="segmented w-56" role="group" aria-label="画面の明るさ">
              {(
                [
                  ['system', '自動'],
                  ['light', 'ライト'],
                  ['dark', 'ダーク'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={theme === v}
                  onClick={() => {
                    setThemeChoice(v);
                    setTheme(v);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
            <Oru size={40} anim={oru ? 'wave' : 'idle'} />
            <span className="flex-1">
              <span className="block text-sm">おるを出す</span>
              <span className="text-xs text-ink-3">アプリを開いたときなどに、ときどき出てきてひとことしゃべります</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="おるを出す"
              checked={oru}
              onChange={(e) => {
                setOruEnabled(e.target.checked);
                setOru(e.target.checked);
              }}
              className={SWITCH}
            />
          </label>
        </div>

        <h2 className="section-title">データ</h2>
        <div className="card divide overflow-hidden">
          <a href="/api/export.csv" download className="row-item hover:bg-surface-2/60">
            <IconBadge className="bg-surface-2 text-ink-2">
              <Download className="size-5" />
            </IconBadge>
            <span className="flex-1">
              <span className="block">CSV で書き出す</span>
              <span className="text-xs text-ink-3">すべてのメモ（1件で1行）。Excel やスプレッドシートで開けます</span>
            </span>
          </a>
        </div>

        {user.role === 'owner' && <MembersSection />}

        <h2 className="section-title">パスキー（ログインに使う端末）</h2>
        <div className="card divide overflow-hidden">
          {passkeys.data?.map((p) => (
            <div key={p.id} className="row-item">
              <IconBadge className="bg-surface-2 text-ink-2">
                <Fingerprint className="size-5" />
              </IconBadge>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.deviceName}</span>
                <span className="block text-xs text-ink-3">
                  登録 {formatDateTime(p.createdAt)}
                  {p.lastUsedAt && ` ・最終使用 ${formatDateTime(p.lastUsedAt)}`}
                </span>
              </span>
              {(passkeys.data?.length ?? 0) > 1 && (
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => window.confirm(`「${p.deviceName}」のパスキーを削除しますか？`) && void run(() => api.deletePasskey(p.id), '削除しました').then(passkeys.reload)}
                >
                  削除
                </button>
              )}
            </div>
          ))}
          <button type="button" className="row-item font-medium text-brand hover:bg-surface-2/60" onClick={() => void addPasskey()}>
            <IconBadge>
              <Plus className="size-5" />
            </IconBadge>
            この端末のパスキーを追加
          </button>
        </div>
        <p className="mx-1 mt-2 text-xs text-ink-3">家計簿とは別のアプリなので、パスキーも別に登録します。iPhone のパスキーは iCloud で Mac にも同期されます。</p>

        <h2 className="section-title">ログイン</h2>
        <div className="card divide overflow-hidden">
          <button
            type="button"
            className="row-item hover:bg-surface-2/60"
            onClick={() =>
              window.confirm('新しいリカバリーコードを発行します。今までのコードは使えなくなります。よろしいですか？') &&
              void run(async () => setCodes((await api.regenerateRecoveryCodes()).recoveryCodes))
            }
          >
            <IconBadge>
              <KeyRound className="size-5" />
            </IconBadge>
            <span className="flex-1">リカバリーコードを再発行</span>
            <ChevronRight className="size-5 text-ink-3" />
          </button>
          <button type="button" className="row-item hover:bg-surface-2/60" onClick={() => void logout(false)}>
            <IconBadge className="bg-surface-2 text-ink-2">
              <LogOut className="size-5" />
            </IconBadge>
            <span className="flex-1">ログアウト</span>
          </button>
          <button type="button" className="row-item font-medium text-danger hover:bg-surface-2/60" onClick={() => void logout(true)}>
            <IconBadge className="bg-danger/10 text-danger">
              <LogOut className="size-5" />
            </IconBadge>
            すべての端末からログアウト
          </button>
        </div>
      </div>

      {manage && <CategoryManager onClose={() => setManage(false)} />}
      {codes && (
        <Sheet title="新しいリカバリーコード" onClose={() => setCodes(null)}>
          <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
        </Sheet>
      )}
    </div>
  );
}
