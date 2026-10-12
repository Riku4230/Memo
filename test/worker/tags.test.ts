import { describe, expect, it } from 'vitest';
import { call, createUser, genreId, storeId } from './helpers';

describe('購入先・ジャンル', () => {
  it('追加・名前の変更・同じ名前は断る', async () => {
    const user = await createUser();
    const res = await call('POST', '/stores', { user, body: { name: 'コストコ', icon: 'store', color: '#2a78d6' } });
    expect(res.status).toBe(201);
    expect((await call('POST', '/stores', { user, body: { name: 'コストコ', icon: 'store', color: '#2a78d6' } })).status).toBe(409);
    expect((await call('PATCH', `/stores/${res.json.id}`, { user, body: { name: 'Costco' } })).status).toBe(200);
    expect((await call('POST', '/stores', { user, body: { name: 'x', icon: 'store', color: 'red' } })).status).toBe(400);
  });

  it('並べ替えは全部の並びを受け取る。足りなければ断る', async () => {
    const user = await createUser();
    const list = (await call('GET', '/genres', { user })).json as { id: string }[];
    const reversed = list.map((g) => g.id).reverse();
    expect((await call('POST', '/genres/reorder', { user, body: { ids: reversed } })).status).toBe(200);
    expect(((await call('GET', '/genres', { user })).json as { id: string }[]).map((g) => g.id)).toEqual(reversed);
    expect((await call('POST', '/genres/reorder', { user, body: { ids: reversed.slice(1) } })).status).toBe(409);
  });

  it('ジャンルを消すと、メモのジャンルが外れる（移し先を選べば移る）', async () => {
    const user = await createUser();
    const created = await call('POST', '/genres', { user, body: { name: '消すジャンル', icon: 'tag', color: '#8a8f98' } });
    const other = await genreId('家電');
    const m1 = await call('POST', '/memos', { user, body: { title: 'a', genreId: created.json.id } });
    expect((await call('GET', `/genres/${created.json.id}/usage`, { user })).json.memos).toBe(1);
    expect((await call('DELETE', `/genres/${created.json.id}`, { user, body: { moveTo: null } })).status).toBe(200);
    expect((await call('GET', `/memos/${m1.json.id}`, { user })).json.genreId).toBeNull();

    const g2 = await call('POST', '/genres', { user, body: { name: '移すジャンル', icon: 'tag', color: '#8a8f98' } });
    const m2 = await call('POST', '/memos', { user, body: { title: 'b', genreId: g2.json.id } });
    await call('DELETE', `/genres/${g2.json.id}`, { user, body: { moveTo: other } });
    expect((await call('GET', `/memos/${m2.json.id}`, { user })).json.genreId).toBe(other);
  });

  it('購入先を移すとき、移し先の候補があるメモは移し先の候補を残す', async () => {
    const user = await createUser();
    const gone = (await call('POST', '/stores', { user, body: { name: '閉店する店', icon: 'store', color: '#8a8f98' } })).json.id as string;
    const amazon = await storeId('Amazon');
    const both = await call('POST', '/memos', { user, body: { title: '両方', offers: [{ storeId: gone, price: 100 }, { storeId: amazon, price: 200 }] } });
    const only = await call('POST', '/memos', { user, body: { title: '片方', offers: [{ storeId: gone, price: 300 }] } });
    expect((await call('DELETE', `/stores/${gone}`, { user, body: { moveTo: amazon } })).status).toBe(200);
    const a = (await call('GET', `/memos/${both.json.id}`, { user })).json;
    expect(a.offers).toEqual([expect.objectContaining({ storeId: amazon, price: 200 })]);
    const b = (await call('GET', `/memos/${only.json.id}`, { user })).json;
    expect(b.offers).toEqual([expect.objectContaining({ storeId: amazon, price: 300 })]);
  });

  it('購入先を移さずに消すと、その候補が外れる', async () => {
    const user = await createUser();
    const gone = (await call('POST', '/stores', { user, body: { name: '消す店', icon: 'store', color: '#8a8f98' } })).json.id as string;
    const m = await call('POST', '/memos', { user, body: { title: 'x', offers: [{ storeId: gone, price: 1 }] } });
    await call('DELETE', `/stores/${gone}`, { user, body: {} });
    expect((await call('GET', `/memos/${m.json.id}`, { user })).json.offers).toEqual([]);
  });
});
