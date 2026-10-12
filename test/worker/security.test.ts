import { describe, expect, it } from 'vitest';
import { call, createUser } from './helpers';

describe('ログインと送信元の確認', () => {
  it('ログインしていなければメモを読めない・書けない', async () => {
    expect((await call('GET', '/data')).status).toBe(401);
    expect((await call('POST', '/memos', { body: { title: 'x' } })).status).toBe(401);
    expect((await call('GET', '/export.csv')).status).toBe(401);
  });

  it('ほかのサイトからの変更は断る（CSRF）', async () => {
    const user = await createUser();
    expect((await call('POST', '/memos', { user, body: { title: 'x' }, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('POST', '/memos', { user, body: { title: 'x' }, origin: null })).status).toBe(403);
  });

  it('セットアップ用トークンが違えば断る', async () => {
    const res = await call('POST', '/auth/setup/options', { body: { setupToken: 'wrong-token-wrong-token', name: 'りく' } });
    expect([403]).toContain(res.status);
  });

  it('メンバーは管理者の画面を使えない', async () => {
    const member = await createUser();
    expect((await call('GET', '/admin/members', { user: member })).status).toBe(403);
    expect((await call('POST', '/admin/invites', { user: member, body: {} })).status).toBe(403);
  });

  it('API の応答はキャッシュさせない', async () => {
    const user = await createUser();
    const res = await call('GET', '/data', { user });
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
});
