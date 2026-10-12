import { describe, expect, it } from 'vitest';
import { call, createUser } from './helpers';

describe('管理者', () => {
  it('招待リンクを作り、確かめられる。取り消すと使えない', async () => {
    const owner = await createUser({ role: 'owner' });
    const res = await call('POST', '/admin/invites', { user: owner, body: { note: 'えりえり' } });
    expect(res.status).toBe(201);
    const token = (res.json.url as string).split('#invite=')[1]!;
    expect((await call('POST', '/auth/invite/check', { body: { token } })).status).toBe(200);
    expect((await call('DELETE', `/admin/invites/${res.json.id}`, { user: owner })).status).toBe(200);
    expect((await call('POST', '/auth/invite/check', { body: { token } })).status).toBe(404);
  });

  it('メンバーを消しても、その人が追加したメモは残る', async () => {
    const owner = await createUser({ role: 'owner' });
    const member = await createUser({ name: 'メンバー' });
    const memo = await call('POST', '/memos', { user: member, body: { title: 'メンバーのメモ' } });
    expect((await call('DELETE', `/admin/members/${member.id}`, { user: owner })).status).toBe(200);
    const after = await call('GET', `/memos/${memo.json.id}`, { user: owner });
    expect(after.status).toBe(200);
    expect(after.json.createdBy).toBeNull();
    // 消した人のセッションは使えない
    expect((await call('GET', '/data', { user: member })).status).toBe(401);
  });

  it('me はメモ帳を使っている人の名前を返す', async () => {
    const owner = await createUser({ role: 'owner', name: 'りく' });
    const res = await call('GET', '/auth/me', { user: owner });
    expect(res.json.user.name).toBe('りく');
    expect(res.json.members.some((m: { id: string }) => m.id === owner.id)).toBe(true);
  });
});
