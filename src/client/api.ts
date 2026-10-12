import { startAuthentication } from '@simplewebauthn/browser';
import type { CategoryInput, MemoCreateInput, MemoUpdateInput } from '../shared/schemas';
import type { AppDataResponse, InviteInfo, Me, MemberInfo, Memo, PasskeyInfo, SessionInfo } from '../shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

/** ログインしていなくても呼べるAPI。ここでの 401 はログイン画面に戻す合図ではない */
const PUBLIC_AUTH_PATHS = ['/auth/me', '/auth/login/', '/auth/setup/', '/auth/invite/', '/auth/recover', '/auth/logout', '/auth/reauth/'];

/**
 * 重要な操作でサーバーが本人確認を求めたとき（403 reauth_required）、
 * 登録済みのパスキーで本人確認してから元の操作をやり直す。
 */
async function reauthenticate(): Promise<void> {
  const options = await request<unknown>('POST', '/auth/reauth/options', undefined, false);
  const response = await startAuthentication({ optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
  await request('POST', '/auth/reauth/verify', { response }, false);
}

async function request<T>(method: string, path: string, body?: unknown, allowReauth = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline', '接続がありません。通信環境を確認してください');
  }
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    if (res.status === 401 && !PUBLIC_AUTH_PATHS.some((p) => path.startsWith(p))) onUnauthorized();
    if (res.status === 403 && data?.error?.code === 'reauth_required' && allowReauth) {
      await reauthenticate();
      return request<T>(method, path, body, false);
    }
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'エラーが発生しました');
  }
  return data as T;
}

export const api = {
  me: () => request<Me>('GET', '/auth/me'),
  setupOptions: (setupToken: string, name: string) => request<unknown>('POST', '/auth/setup/options', { setupToken, name }),
  setupVerify: (response: unknown, name: string, deviceName: string) =>
    request<{ recoveryCodes: string[] }>('POST', '/auth/setup/verify', { response, name, deviceName }),
  inviteCheck: (token: string) => request<{ expiresAt: string }>('POST', '/auth/invite/check', { token }),
  inviteOptions: (token: string, name: string) => request<unknown>('POST', '/auth/invite/options', { token, name }),
  inviteVerify: (response: unknown, name: string, deviceName: string) =>
    request<{ recoveryCodes: string[] }>('POST', '/auth/invite/verify', { response, name, deviceName }),
  loginOptions: () => request<unknown>('POST', '/auth/login/options'),
  loginVerify: (response: unknown) => request<{ ok: true }>('POST', '/auth/login/verify', { response }),
  recover: (code: string) => request<{ remaining: number }>('POST', '/auth/recover', { code }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  passkeys: () => request<PasskeyInfo[]>('GET', '/auth/passkeys'),
  passkeyOptions: () => request<unknown>('POST', '/auth/passkeys/options'),
  passkeyVerify: (response: unknown, deviceName: string) => request<{ ok: true }>('POST', '/auth/passkeys/verify', { response, deviceName }),
  deletePasskey: (id: string) => request<{ ok: true }>('DELETE', `/auth/passkeys/${encodeURIComponent(id)}`),
  sessions: () => request<SessionInfo[]>('GET', '/auth/sessions'),
  logoutAll: () => request<{ ok: true }>('DELETE', '/auth/sessions'),
  regenerateRecoveryCodes: () => request<{ recoveryCodes: string[] }>('POST', '/auth/recovery-codes'),

  data: () => request<AppDataResponse>('GET', '/data'),
  createMemo: (body: MemoCreateInput) => request<Memo>('POST', '/memos', body),
  updateMemo: (id: string, body: MemoUpdateInput) => request<Memo>('PATCH', `/memos/${id}`, body),
  setDone: (id: string, done: boolean) => request<Memo>(done ? 'PUT' : 'DELETE', `/memos/${id}/done`),
  deleteMemo: (id: string) => request<{ ok: true }>('DELETE', `/memos/${id}`),
  restoreMemo: (id: string) => request<Memo>('POST', `/memos/${id}/restore`),

  createCategory: (body: CategoryInput) => request<{ id: string }>('POST', '/categories', body),
  updateCategory: (id: string, body: Partial<CategoryInput>) => request<{ ok: true }>('PATCH', `/categories/${id}`, body),
  reorderCategories: (ids: string[]) => request<{ ok: true }>('POST', '/categories/reorder', { ids }),
  deleteCategory: (id: string, moveTo: string | null) => request<{ ok: true }>('DELETE', `/categories/${id}`, { moveTo }),
  createSubcategory: (categoryId: string, name: string) => request<{ id: string }>('POST', `/categories/${categoryId}/subcategories`, { name }),
  renameSubcategory: (id: string, name: string) => request<{ ok: true }>('PATCH', `/categories/subcategories/${id}`, { name }),
  deleteSubcategory: (id: string) => request<{ ok: true }>('DELETE', `/categories/subcategories/${id}`),

  invites: () => request<InviteInfo[]>('GET', '/admin/invites'),
  createInvite: (note: string) => request<{ id: string; url: string; expiresAt: string }>('POST', '/admin/invites', { note }),
  revokeInvite: (id: string) => request<{ ok: true }>('DELETE', `/admin/invites/${id}`),
  members: () => request<MemberInfo[]>('GET', '/admin/members'),
  removeMember: (id: string) => request<{ ok: true }>('DELETE', `/admin/members/${id}`),
};

export function errorText(e: unknown, fallback = '処理に失敗しました'): string {
  return e instanceof ApiError ? e.message : fallback;
}
