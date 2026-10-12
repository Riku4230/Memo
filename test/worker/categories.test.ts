import { describe, expect, it } from 'vitest';
import { call, categoryId, createUser, subcategoryId } from './helpers';

describe('大カテゴリ・中カテゴリ', () => {
  it('大カテゴリの追加・名前の変更・同じ名前は断る', async () => {
    const user = await createUser();
    const res = await call('POST', '/categories', { user, body: { name: '本', icon: 'book', color: '#2a78d6' } });
    expect(res.status).toBe(201);
    expect((await call('POST', '/categories', { user, body: { name: '本', icon: 'book', color: '#2a78d6' } })).status).toBe(409);
    expect((await call('PATCH', `/categories/${res.json.id}`, { user, body: { name: '本・雑誌' } })).status).toBe(200);
    expect((await call('POST', '/categories', { user, body: { name: 'x', icon: 'book', color: 'red' } })).status).toBe(400);
  });

  it('中カテゴリの追加・名前の変更。同じ大カテゴリの中で同じ名前は断るが、別の大カテゴリならよい', async () => {
    const user = await createUser();
    const [daily, hundred] = await Promise.all([categoryId('日用品'), categoryId('100均')]);
    const res = await call('POST', `/categories/${daily}/subcategories`, { user, body: { name: 'ハック' } });
    expect(res.status).toBe(201);
    expect((await call('POST', `/categories/${daily}/subcategories`, { user, body: { name: 'ハック' } })).status).toBe(409);
    expect((await call('POST', `/categories/${hundred}/subcategories`, { user, body: { name: 'ハック' } })).status).toBe(201);
    expect((await call('PATCH', `/categories/subcategories/${res.json.id}`, { user, body: { name: 'ハックドラッグ' } })).status).toBe(200);
    const list = (await call('GET', '/categories', { user })).json as { id: string; subcategories: { name: string }[] }[];
    expect(list.find((c) => c.id === daily)!.subcategories.map((s) => s.name)).toContain('ハックドラッグ');
  });

  it('並べ替えは全部の並びを受け取る。足りなければ断る', async () => {
    const user = await createUser();
    const list = (await call('GET', '/categories', { user })).json as { id: string }[];
    const reversed = list.map((c) => c.id).reverse();
    expect((await call('POST', '/categories/reorder', { user, body: { ids: reversed } })).status).toBe(200);
    expect(((await call('GET', '/categories', { user })).json as { id: string }[]).map((c) => c.id)).toEqual(reversed);
    expect((await call('POST', '/categories/reorder', { user, body: { ids: reversed.slice(1) } })).status).toBe(409);
  });

  it('中カテゴリを消すと、メモは中カテゴリなしになる', async () => {
    const user = await createUser();
    const cat = await categoryId('100均');
    const sub = (await call('POST', `/categories/${cat}/subcategories`, { user, body: { name: '消す店' } })).json.id as string;
    const m = await call('POST', '/memos', { user, body: { title: 'x', categoryId: cat, subcategoryId: sub } });
    expect((await call('DELETE', `/categories/subcategories/${sub}`, { user })).status).toBe(200);
    expect((await call('GET', `/memos/${m.json.id}`, { user })).json).toMatchObject({ categoryId: cat, subcategoryId: null });
  });

  it('大カテゴリを消すと、メモは大カテゴリなしになる（移し先を選べば移り、中カテゴリは外れる）', async () => {
    const user = await createUser();
    const gone = (await call('POST', '/categories', { user, body: { name: '消す', icon: 'package', color: '#8a8f98' } })).json.id as string;
    const sub = (await call('POST', `/categories/${gone}/subcategories`, { user, body: { name: '中' } })).json.id as string;
    const m1 = await call('POST', '/memos', { user, body: { title: 'a', categoryId: gone, subcategoryId: sub } });
    expect((await call('DELETE', `/categories/${gone}`, { user, body: { moveTo: null } })).status).toBe(200);
    expect((await call('GET', `/memos/${m1.json.id}`, { user })).json).toMatchObject({ categoryId: null, subcategoryId: null });

    const other = await categoryId('その他');
    const gone2 = (await call('POST', '/categories', { user, body: { name: '移す', icon: 'package', color: '#8a8f98' } })).json.id as string;
    const m2 = await call('POST', '/memos', { user, body: { title: 'b', categoryId: gone2 } });
    await call('DELETE', `/categories/${gone2}`, { user, body: { moveTo: other } });
    expect((await call('GET', `/memos/${m2.json.id}`, { user })).json).toMatchObject({ categoryId: other, subcategoryId: null });
  });

  it('中カテゴリの id を大カテゴリの id として使うことはできない', async () => {
    const user = await createUser();
    const daiso = await subcategoryId('100均', 'ダイソー');
    expect((await call('POST', `/categories/${daiso}/subcategories`, { user, body: { name: 'x' } })).status).toBe(404);
  });
});
