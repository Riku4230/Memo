import { Hono } from 'hono';
import { z } from 'zod';
import { categoryInput, subcategoryName } from '../../shared/schemas';
import type { Category } from '../../shared/types';
import type { AppEnv } from '../env';
import { fail, isUniqueViolation, nowIso, parseJson } from '../lib/http';

/** 大カテゴリの数・1つの大カテゴリの中カテゴリの数の上限 */
const MAX_CATEGORIES = 100;
const MAX_SUBCATEGORIES = 50;

/** 大カテゴリを並び順に、中カテゴリを入れて返す */
export async function listCategories(db: D1Database): Promise<Category[]> {
  const [cats, subs] = await db.batch([
    db.prepare('SELECT id, name, icon, color, sort_order FROM categories ORDER BY sort_order, created_at'),
    db.prepare('SELECT id, category_id, name, sort_order FROM subcategories ORDER BY sort_order, created_at'),
  ]);
  const byCategory = new Map<string, Category['subcategories']>();
  for (const s of subs!.results as { id: string; category_id: string; name: string; sort_order: number }[]) {
    const list = byCategory.get(s.category_id) ?? [];
    list.push({ id: s.id, name: s.name, sortOrder: s.sort_order });
    byCategory.set(s.category_id, list);
  }
  return (cats!.results as { id: string; name: string; icon: string; color: string; sort_order: number }[]).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sort_order,
    subcategories: byCategory.get(c.id) ?? [],
  }));
}

export const categories = new Hono<AppEnv>();

categories.get('/', async (c) => c.json(await listCategories(c.env.DB)));

categories.post('/', async (c) => {
  const body = await parseJson(c, categoryInput);
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(sort_order), -1) AS last FROM categories').first<{ n: number; last: number }>();
  if ((count?.n ?? 0) >= MAX_CATEGORIES) fail(409, 'too_many', `大カテゴリは${MAX_CATEGORIES}個までです`);
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    await c.env.DB.prepare('INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, body.name, body.icon, body.color, (count?.last ?? -1) + 1, now, now)
      .run();
  } catch (e) {
    if (isUniqueViolation(e)) fail(409, 'duplicate_name', '同じ名前の大カテゴリがあります');
    throw e;
  }
  return c.json({ id }, 201);
});

/** 並べ替え。ids は全部の並び（足りない・知らない ID があれば断る） */
categories.post('/reorder', async (c) => {
  const { ids } = await parseJson(c, z.object({ ids: z.array(z.string().max(64)).max(MAX_CATEGORIES) }));
  const current = await listCategories(c.env.DB);
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.some((t) => t.id === id))) {
    fail(409, 'stale_order', '大カテゴリが変わっています。画面を読み直してください');
  }
  await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').bind(i, id)));
  return c.json({ ok: true });
});

// ---- 中カテゴリ（/:id より先に書く） ----
categories.patch('/subcategories/:id', async (c) => {
  const { name } = await parseJson(c, subcategoryName);
  try {
    const res = await c.env.DB.prepare('UPDATE subcategories SET name = ?, updated_at = ? WHERE id = ?').bind(name, nowIso(), c.req.param('id')).run();
    if (!res.meta.changes) fail(404, 'not_found', '中カテゴリが見つかりません');
  } catch (e) {
    if (isUniqueViolation(e)) fail(409, 'duplicate_name', 'この大カテゴリに同じ名前の中カテゴリがあります');
    throw e;
  }
  return c.json({ ok: true });
});

/** 中カテゴリを消す。使っているメモは中カテゴリなしになる（外部キーの決まり） */
categories.delete('/subcategories/:id', async (c) => {
  const res = await c.env.DB.prepare('DELETE FROM subcategories WHERE id = ?').bind(c.req.param('id')).run();
  if (!res.meta.changes) fail(404, 'not_found', '中カテゴリが見つかりません');
  return c.json({ ok: true });
});

categories.post('/:id/subcategories', async (c) => {
  const { name } = await parseJson(c, subcategoryName);
  const categoryId = c.req.param('id');
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(sort_order), -1) AS last FROM subcategories WHERE category_id = ?')
    .bind(categoryId)
    .first<{ n: number; last: number }>();
  if ((count?.n ?? 0) >= MAX_SUBCATEGORIES) fail(409, 'too_many', `中カテゴリは1つの大カテゴリに${MAX_SUBCATEGORIES}個までです`);
  if (!(await c.env.DB.prepare('SELECT 1 FROM categories WHERE id = ?').bind(categoryId).first())) fail(404, 'not_found', '大カテゴリが見つかりません');
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    await c.env.DB.prepare('INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, categoryId, name, (count?.last ?? -1) + 1, now, now)
      .run();
  } catch (e) {
    if (isUniqueViolation(e)) fail(409, 'duplicate_name', 'この大カテゴリに同じ名前の中カテゴリがあります');
    throw e;
  }
  return c.json({ id }, 201);
});

categories.patch('/:id', async (c) => {
  const body = await parseJson(c, categoryInput.partial());
  try {
    const res = await c.env.DB.prepare(
      'UPDATE categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), color = COALESCE(?, color), updated_at = ? WHERE id = ?',
    )
      .bind(body.name ?? null, body.icon ?? null, body.color ?? null, nowIso(), c.req.param('id'))
      .run();
    if (!res.meta.changes) fail(404, 'not_found', '大カテゴリが見つかりません');
  } catch (e) {
    if (isUniqueViolation(e)) fail(409, 'duplicate_name', '同じ名前の大カテゴリがあります');
    throw e;
  }
  return c.json({ ok: true });
});

/**
 * 大カテゴリを消す。中カテゴリも一緒に消える。
 * moveTo を渡すと、使っているメモをその大カテゴリへ移す（中カテゴリは外れる）。渡さなければメモは大カテゴリなしになる
 */
categories.delete('/:id', async (c) => {
  const { moveTo } = await parseJson(c, z.object({ moveTo: z.string().max(64).nullable().default(null) }));
  const id = c.req.param('id');
  const db = c.env.DB;
  if (moveTo === id) fail(400, 'validation_error', '同じ大カテゴリには移せません');
  if (moveTo && !(await db.prepare('SELECT 1 FROM categories WHERE id = ?').bind(moveTo).first())) fail(400, 'not_found', '移し先の大カテゴリが見つかりません');
  const res = await db.batch([
    ...(moveTo ? [db.prepare('UPDATE memos SET category_id = ?, subcategory_id = NULL WHERE category_id = ?').bind(moveTo, id)] : []),
    db.prepare('DELETE FROM categories WHERE id = ?').bind(id),
  ]);
  if (!res[res.length - 1]!.meta.changes) fail(404, 'not_found', '大カテゴリが見つかりません');
  return c.json({ ok: true });
});
