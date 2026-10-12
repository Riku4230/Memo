import { Check, Copy, Link2, Share, Trash2, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import type { InviteInfo } from '../../shared/types';
import { api, errorText } from '../api';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { formatDateTime } from '../lib/format';
import { useAsync } from '../lib/hooks';

const STATUS_LABEL: Record<InviteInfo['status'], string> = { pending: '未使用', used: '登録済み', expired: '期限切れ', revoked: '取り消し済み' };

/** 管理者向け：メンバーの一覧・削除と、招待リンクの発行・取り消し（Kakeibo の MembersSection から。家計簿の共有の選択はない） */
export function MembersSection() {
  const toast = useToast();
  const members = useAsync(() => api.members(), []);
  const invites = useAsync(() => api.invites(), []);
  const [created, setCreated] = useState<{ url: string; note: string; expiresAt: string } | null>(null);
  const [draft, setDraft] = useState<{ note: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, message?: string) {
    setError(null);
    try {
      await fn();
      if (message) toast(message);
      members.reload();
      invites.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function createInvite() {
    if (!draft) return;
    const note = draft.note.trim().slice(0, 30);
    await run(async () => {
      const res = await api.createInvite(note);
      setDraft(null);
      setCopied(false);
      setCreated({ url: res.url, note, expiresAt: res.expiresAt });
    });
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setError('コピーできませんでした。リンクを長押ししてコピーしてください');
    }
  }

  const pending = (invites.data ?? []).filter((i) => i.status === 'pending');
  const history = (invites.data ?? []).filter((i) => i.status !== 'pending').slice(0, 5);

  return (
    <>
      <h2 className="section-title">メンバー</h2>
      {error && <p className="mb-2 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
      <div className="card divide overflow-hidden">
        {members.data?.map((m) => (
          <div key={m.id} className="row-item">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
              <UserRound className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {m.name}
                {m.role === 'owner' && <span className="ml-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand">管理者</span>}
              </span>
              <span className="block text-xs text-ink-3">
                メモ {m.memoCount}件{m.lastSeenAt && ` ・最終アクセス ${formatDateTime(m.lastSeenAt)}`}
              </span>
            </span>
            {m.role === 'member' && (
              <button
                type="button"
                className="icon-btn hover:text-danger"
                aria-label={`${m.name}を削除`}
                onClick={() =>
                  window.confirm(`「${m.name}」を削除しますか？\nこの人はログインできなくなります。この人が書いたメモはそのまま残ります。`) &&
                  void run(() => api.removeMember(m.id), 'メンバーを削除しました')
                }
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
        {pending.map((i) => (
          <div key={i.id} className="row-item">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-ink-3/50 text-ink-3">
              <Link2 className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink-2">招待中{i.note && `：${i.note}`}</span>
              <span className="block text-xs text-ink-3">{formatDateTime(i.expiresAt)} まで有効</span>
            </span>
            <button type="button" className="btn btn-sm" onClick={() => void run(() => api.revokeInvite(i.id), '招待を取り消しました')}>
              取り消す
            </button>
          </div>
        ))}
        <button type="button" className="row-item font-medium text-brand hover:bg-surface-2/60" onClick={() => setDraft({ note: '' })}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Link2 className="size-5" />
          </span>
          招待リンクを作成
        </button>
      </div>
      <p className="mx-1 mt-2 text-xs text-ink-3">招待した人は、同じメモを見て書けます。リンクは7日間・1回限り有効です。</p>
      {history.length > 0 && (
        <p className="mx-1 mt-1 text-xs text-ink-3">
          最近の招待：
          {history.map((i) => `${i.note || '（メモなし）'} ${STATUS_LABEL[i.status]}${i.usedByName ? `（${i.usedByName}）` : ''}`).join(' / ')}
        </p>
      )}

      {draft && (
        <Sheet title="招待リンクを作成" onClose={() => setDraft(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void createInvite();
            }}
          >
            <label className="block space-y-1.5">
              <span className="label">誰に送る招待ですか？（自分用のメモ・任意）</span>
              <input className="input" maxLength={30} value={draft.note} onChange={(e) => setDraft({ note: e.target.value })} />
            </label>
            <button type="submit" className="btn btn-primary w-full">
              リンクを作成
            </button>
          </form>
        </Sheet>
      )}

      {created && (
        <Sheet title="招待リンクを作成しました" onClose={() => setCreated(null)}>
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              このリンクを{created.note ? `「${created.note}」` : '招待したい人'}に送ってください。登録すると、同じメモを一緒に使えます。
              <strong className="text-ink">リンクはこの画面でしか表示されません。</strong>
            </p>
            <div aria-label="招待リンク" className="rounded-lg border border-line bg-surface-2 p-3 text-sm break-all select-all">
              {created.url}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn" onClick={() => void copy()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'コピーしました' : 'コピー'}
              </button>
              {'share' in navigator ? (
                <button type="button" className="btn btn-primary" onClick={() => void navigator.share({ title: '欲しいものメモへの招待', url: created.url }).catch(() => {})}>
                  <Share className="size-4" />
                  共有
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => setCreated(null)}>
                  <X className="size-4" />
                  閉じる
                </button>
              )}
            </div>
            <p className="text-xs text-ink-3">有効期限：{formatDateTime(created.expiresAt)}・1回だけ使えます。知らない人に渡ったときは、設定の「取り消す」で無効にできます。</p>
          </div>
        </Sheet>
      )}
    </>
  );
}
