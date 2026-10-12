import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { runMaintenance } from '../../src/worker/services/maintenance';
import { call, categoryId, createUser, subcategoryId } from './helpers';

describe('メモ', () => {
  it('名前だけで登録でき、一覧に出る', async () => {
    const user = await createUser();
    const res = await call('POST', '/memos', { user, body: { title: '  ブックスタンド  ' } });
    expect(res.status).toBe(201);
    expect(res.json.title).toBe('ブックスタンド');
    expect(res.json.categoryId).toBeNull();
    expect(res.json.subcategoryId).toBeNull();
    expect(res.json.createdBy).toBe(user.id);
    const data = await call('GET', '/data', { user });
    expect(data.json.memos.some((m: { id: string }) => m.id === res.json.id)).toBe(true);
    const hundred = data.json.categories.find((c: { name: string }) => c.name === '100均');
    expect(hundred.subcategories.map((s: { name: string }) => s.name)).toEqual(['ダイソー', 'セリア', 'キャンドゥ']);
  });

  it('大カテゴリ・中カテゴリ・詳細メモ・リンクを一緒に登録できる', async () => {
    const user = await createUser();
    const [cat, sub] = await Promise.all([categoryId('100均'), subcategoryId('100均', 'ダイソー')]);
    const res = await call('POST', '/memos', {
      user,
      body: { title: 'ブックスタンド', categoryId: cat, subcategoryId: sub, body: 'A4が立つもの', links: [{ url: 'https://example.com/item', label: '商品' }] },
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ categoryId: cat, subcategoryId: sub, body: 'A4が立つもの', links: [{ url: 'https://example.com/item', label: '商品' }] });
  });

  it('ほかの大カテゴリの中カテゴリ・中カテゴリだけ・ない大カテゴリ・http/https 以外のリンクは断る', async () => {
    const user = await createUser();
    const [daily, daiso] = await Promise.all([categoryId('日用品'), subcategoryId('100均', 'ダイソー')]);
    expect((await call('POST', '/memos', { user, body: { title: 'x', categoryId: daily, subcategoryId: daiso } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: 'x', subcategoryId: daiso } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: 'x', categoryId: 'nope' } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: 'x', links: [{ url: 'javascript:alert(1)' }] } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: '   ' } })).status).toBe(400);
  });

  it('同じ clientId で送り直しても二重に登録しない', async () => {
    const user = await createUser();
    const body = { title: '電池', clientId: 'client-abc-12345' };
    const a = await call('POST', '/memos', { user, body });
    const b = await call('POST', '/memos', { user, body });
    expect(a.json.id).toBe(b.json.id);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM memos WHERE client_id = ?').bind('client-abc-12345').first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('編集で大カテゴリを変えると中カテゴリも選び直しになり、本文だけの変更ではカテゴリはそのまま', async () => {
    const user = await createUser();
    const [hundred, daiso, furniture] = await Promise.all([categoryId('100均'), subcategoryId('100均', 'ダイソー'), categoryId('家具')]);
    const created = await call('POST', '/memos', { user, body: { title: '棚', categoryId: hundred, subcategoryId: daiso } });
    const res = await call('PATCH', `/memos/${created.json.id}`, { user, body: { title: '棚（大）', categoryId: furniture, baseUpdatedAt: created.json.updatedAt } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ title: '棚（大）', categoryId: furniture, subcategoryId: null });
    expect(res.json.updatedAt > created.json.updatedAt).toBe(true);
    const res2 = await call('PATCH', `/memos/${created.json.id}`, { user, body: { body: '幅60cmまで' } });
    expect(res2.json).toMatchObject({ body: '幅60cmまで', categoryId: furniture });
    const res3 = await call('PATCH', `/memos/${created.json.id}`, { user, body: { categoryId: null } });
    expect(res3.json).toMatchObject({ categoryId: null, subcategoryId: null });
  });

  it('ほかの人が先に直していたら 409 で知らせ、内容は変えない', async () => {
    const a = await createUser({ name: 'A' });
    const b = await createUser({ name: 'B' });
    const created = await call('POST', '/memos', { user: a, body: { title: '冷蔵庫' } });
    const first = await call('PATCH', `/memos/${created.json.id}`, { user: b, body: { title: 'Bの変更', baseUpdatedAt: created.json.updatedAt } });
    expect(first.status).toBe(200);
    const second = await call('PATCH', `/memos/${created.json.id}`, { user: a, body: { title: 'Aの変更', baseUpdatedAt: created.json.updatedAt } });
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe('conflict');
    expect((await call('GET', `/memos/${created.json.id}`, { user: a })).json.title).toBe('Bの変更');
  });

  it('買ったを付け・外せる。先に付けた人の記録を残す', async () => {
    const a = await createUser({ name: 'A' });
    const b = await createUser({ name: 'B' });
    const created = await call('POST', '/memos', { user: a, body: { title: '掃除機' } });
    const done = await call('PUT', `/memos/${created.json.id}/done`, { user: a });
    expect(done.json.doneAt).not.toBeNull();
    expect(done.json.doneBy).toBe(a.id);
    const again = await call('PUT', `/memos/${created.json.id}/done`, { user: b });
    expect(again.json.doneBy).toBe(a.id);
    const undone = await call('DELETE', `/memos/${created.json.id}/done`, { user: b });
    expect(undone.json.doneAt).toBeNull();
    expect(undone.json.doneBy).toBeNull();
  });

  it('消したメモは一覧から外れ、元に戻せる。7日たつと後片付けで消える', async () => {
    const user = await createUser();
    const created = await call('POST', '/memos', { user, body: { title: '消すもの', links: [{ url: 'https://example.com' }] } });
    const id = created.json.id;
    expect((await call('DELETE', `/memos/${id}`, { user })).status).toBe(200);
    expect((await call('GET', `/memos/${id}`, { user })).status).toBe(404);
    expect((await call('GET', '/data', { user })).json.memos.some((m: { id: string }) => m.id === id)).toBe(false);
    const restored = await call('POST', `/memos/${id}/restore`, { user });
    expect(restored.status).toBe(200);
    expect(restored.json.links).toHaveLength(1);

    await call('DELETE', `/memos/${id}`, { user });
    await runMaintenance(env, new Date(Date.now() + 8 * 86_400_000));
    expect(await env.DB.prepare('SELECT 1 FROM memos WHERE id = ?').bind(id).first()).toBeNull();
    expect(await env.DB.prepare('SELECT 1 FROM memo_links WHERE memo_id = ?').bind(id).first()).toBeNull();
  });

  it('メモ帳は共有：ほかの人が追加したメモも見える・直せる', async () => {
    const a = await createUser({ name: 'A' });
    const b = await createUser({ name: 'B' });
    const created = await call('POST', '/memos', { user: a, body: { title: '共有のメモ' } });
    const data = await call('GET', '/data', { user: b });
    expect(data.json.memos.some((m: { id: string }) => m.id === created.json.id)).toBe(true);
    expect((await call('PATCH', `/memos/${created.json.id}`, { user: b, body: { body: 'Bが追記' } })).status).toBe(200);
  });

  it('CSV はメモ1件で1行、カテゴリの名前を出し、数式になる文字を無害化する', async () => {
    const user = await createUser();
    const [cat, sub] = await Promise.all([categoryId('100均'), subcategoryId('100均', 'セリア')]);
    await call('POST', '/memos', { user, body: { title: '=HYPERLINK("x")', categoryId: cat, subcategoryId: sub } });
    const res = await call('GET', '/export.csv', { user });
    expect(res.status).toBe(200);
    expect(res.text.startsWith('﻿名前,大カテゴリ,中カテゴリ,')).toBe(true);
    const rows = res.text.split('\r\n').filter((l) => l.includes('HYPERLINK'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startsWith(`"'=HYPERLINK(""x"")",100均,セリア,欲しい`)).toBe(true);
  });
});
