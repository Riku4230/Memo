import { createExecutionContext, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { KakeiboBridge } from '../../src/worker/bridge';
import { call, categoryId, createUser, subcategoryId } from './helpers';

const bridge = () => new KakeiboBridge(createExecutionContext(), env);

/** 2人の家計簿から呼ぶ窓口：まだ買っていないものを渡し、「買った」を付ける */
describe('家計簿との連携', () => {
  it('まだ買っていないもの（消したもの・買ったものを除く）を、カテゴリの名前と一緒に渡す', async () => {
    const user = await createUser({ name: 'えりえり' });
    const daily = await categoryId('100均');
    const daiso = await subcategoryId('100均', 'ダイソー');
    const box = (await call('POST', '/memos', { user, body: { title: '収納ケース', categoryId: daily, subcategoryId: daiso } })).json.id as string;
    const bought = (await call('POST', '/memos', { user, body: { title: '電池' } })).json.id as string;
    const removed = (await call('POST', '/memos', { user, body: { title: '消したもの' } })).json.id as string;
    await call('PUT', `/memos/${bought}/done`, { user });
    await call('DELETE', `/memos/${removed}`, { user });
    const wants = await bridge().wants();
    expect(wants).toEqual([{ id: box, title: '収納ケース', category: '100均', subcategory: 'ダイソー' }]);
  });

  it('「買った」を付ける。家計簿と同じ名前の人がいればその人が買ったことにし、もう買ったものは数えない', async () => {
    const user = await createUser({ name: 'りくりく' });
    const a = (await call('POST', '/memos', { user, body: { title: '牛乳' } })).json.id as string;
    const b = (await call('POST', '/memos', { user, body: { title: '洗剤' } })).json.id as string;
    expect(await bridge().markBought([a, b, 'nope'], 'りくりく')).toBe(2);
    expect(await bridge().markBought([a], 'りくりく')).toBe(0);
    const rows = await env.DB.prepare('SELECT id, done_by FROM memos WHERE id IN (?, ?)').bind(a, b).all<{ id: string; done_by: string | null }>();
    expect(rows.results.every((r) => r.done_by === user.id)).toBe(true);
    const c = (await call('POST', '/memos', { user, body: { title: '卵' } })).json.id as string;
    expect(await bridge().markBought([c], '知らない人')).toBe(1);
    expect((await env.DB.prepare('SELECT done_by FROM memos WHERE id = ?').bind(c).first<{ done_by: string | null }>())?.done_by).toBeNull();
  });
});
