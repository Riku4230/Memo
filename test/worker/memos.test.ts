import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { runMaintenance } from '../../src/worker/services/maintenance';
import { call, createUser, genreId, storeId } from './helpers';

describe('メモ', () => {
  it('名前だけで登録でき、一覧に出る', async () => {
    const user = await createUser();
    const res = await call('POST', '/memos', { user, body: { title: '  ドラム式洗濯機  ' } });
    expect(res.status).toBe(201);
    expect(res.json.title).toBe('ドラム式洗濯機');
    expect(res.json.genreId).toBeNull();
    expect(res.json.offers).toEqual([]);
    expect(res.json.createdBy).toBe(user.id);
    const data = await call('GET', '/data', { user });
    expect(data.json.memos.some((m: { id: string }) => m.id === res.json.id)).toBe(true);
    expect(data.json.stores.length).toBeGreaterThan(0);
    expect(data.json.genres.length).toBeGreaterThan(0);
  });

  it('購入先ごとの候補（値段・リンク・ひとこと）とリンクを一緒に登録できる', async () => {
    const user = await createUser();
    const [yodobashi, amazon, washer] = await Promise.all([storeId('ヨドバシ'), storeId('Amazon'), genreId('洗濯機')]);
    const res = await call('POST', '/memos', {
      user,
      body: {
        title: '洗濯機',
        genreId: washer,
        offers: [
          { storeId: yodobashi, price: 189800, url: 'https://www.yodobashi.com/product/1', note: 'ポイント10%', checkedOn: '2026-10-01' },
          { storeId: amazon, price: 179000 },
        ],
        links: [{ url: 'https://example.com/review', label: 'レビュー' }],
      },
    });
    expect(res.status).toBe(201);
    expect(res.json.offers).toEqual([
      { storeId: yodobashi, price: 189800, url: 'https://www.yodobashi.com/product/1', note: 'ポイント10%', checkedOn: '2026-10-01' },
      { storeId: amazon, price: 179000, url: '', note: '', checkedOn: null },
    ]);
    expect(res.json.links).toEqual([{ url: 'https://example.com/review', label: 'レビュー' }]);
  });

  it('http/https 以外のリンク・同じ購入先の重複・ない購入先は断る', async () => {
    const user = await createUser();
    const amazon = await storeId('Amazon');
    expect((await call('POST', '/memos', { user, body: { title: 'x', links: [{ url: 'javascript:alert(1)' }] } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: 'x', offers: [{ storeId: amazon, url: 'data:text/html,hi' }] } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: 'x', offers: [{ storeId: amazon }, { storeId: amazon }] } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: 'x', offers: [{ storeId: 'nope' }] } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: 'x', genreId: 'nope' } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: '   ' } })).status).toBe(400);
    expect((await call('POST', '/memos', { user, body: { title: 'x', offers: [{ storeId: amazon, price: -1 }] } })).status).toBe(400);
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

  it('編集で候補を置き換えられ、ジャンルを外せる', async () => {
    const user = await createUser();
    const [amazon, rakuten, washer] = await Promise.all([storeId('Amazon'), storeId('楽天'), genreId('洗濯機')]);
    const created = await call('POST', '/memos', { user, body: { title: '洗濯機', genreId: washer, offers: [{ storeId: amazon, price: 100 }] } });
    const res = await call('PATCH', `/memos/${created.json.id}`, {
      user,
      body: { title: '洗濯機（ドラム式）', genreId: null, offers: [{ storeId: rakuten, price: 90 }], baseUpdatedAt: created.json.updatedAt },
    });
    expect(res.status).toBe(200);
    expect(res.json.title).toBe('洗濯機（ドラム式）');
    expect(res.json.genreId).toBeNull();
    expect(res.json.offers.map((o: { storeId: string }) => o.storeId)).toEqual([rakuten]);
    expect(res.json.updatedAt > created.json.updatedAt).toBe(true);
    // 本文だけの変更では、候補はそのまま
    const res2 = await call('PATCH', `/memos/${created.json.id}`, { user, body: { body: '幅60cmまで' } });
    expect(res2.json.body).toBe('幅60cmまで');
    expect(res2.json.offers).toHaveLength(1);
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

  it('CSV は候補1つで1行、数式になる文字を無害化する', async () => {
    const user = await createUser();
    const [yodobashi, amazon] = await Promise.all([storeId('ヨドバシ'), storeId('Amazon')]);
    await call('POST', '/memos', {
      user,
      body: { title: '=HYPERLINK("x")', offers: [{ storeId: yodobashi, price: 1000 }, { storeId: amazon, price: 900 }] },
    });
    const res = await call('GET', '/export.csv', { user });
    expect(res.status).toBe(200);
    expect(res.text.startsWith('﻿名前,')).toBe(true);
    const rows = res.text.split('\r\n').filter((l) => l.includes('HYPERLINK'));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
  });
});
