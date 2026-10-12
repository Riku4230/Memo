import { Hono } from 'hono';
import { z } from 'zod';
import { tagInput } from '../../shared/schemas';
import type { Tag } from '../../shared/types';
import type { AppEnv } from '../env';
import { fail, isUniqueViolation, nowIso, parseJson } from '../lib/http';

/** 購入先・ジャンルの数の上限 */
const MAX_TAGS = 100;

type Table = 'stores' | 'genres';

export async function listTags(db: D1Database, table: Table): Promise<Tag[]> {
  const { results } = await db
    .prepare(`SELECT id, name, icon, color, sort_order FROM ${table} ORDER BY sort_order, created_at`)
    .all<{ id: string; name: string; icon: string; color: string; sort_order: number }>();
  return results.map((r) => ({ id: r.id, name: r.name, icon: r.icon, color: r.color, sortOrder: r.sort_order }));
}

/**
 * 購入先（stores）とジャンル（genres）は作りが同じなので、同じ API を表の名前だけ変えて作る。
 * 違うのは消すときの扱い：ジャンルはメモのジャンルを外す（または移す）、購入先はメモの候補ごと外す（または移す）
 */
function tagRoutes(table: Table) {
  const label = table === 'stores' ? '購入先' : 'ジャンル';
  const app = new Hono<AppEnv>();
  const duplicate = () => fail(409, 'duplicate_name', `同じ名前の${label}があります`);

  app.get('/', async (c) => c.json(await listTags(c.env.DB, table)));

  app.post('/', async (c) => {
    const body = await parseJson(c, tagInput);
    const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(sort_order), -1) AS last FROM ${table}`).first<{ n: number; last: number }>();
    if ((count?.n ?? 0) >= MAX_TAGS) fail(409, 'too_many', `${label}は${MAX_TAGS}個までです`);
    const id = crypto.randomUUID();
    const now = nowIso();
    try {
      await c.env.DB.prepare(`INSERT INTO ${table} (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, body.name, body.icon, body.color, (count?.last ?? -1) + 1, now, now)
        .run();
    } catch (e) {
      if (isUniqueViolation(e)) duplicate();
      throw e;
    }
    return c.json({ id }, 201);
  });

  app.patch('/:id', async (c) => {
    const body = await parseJson(c, tagInput.partial());
    try {
      const res = await c.env.DB.prepare(
        `UPDATE ${table} SET name = COALESCE(?, name), icon = COALESCE(?, icon), color = COALESCE(?, color), updated_at = ? WHERE id = ?`,
      )
        .bind(body.name ?? null, body.icon ?? null, body.color ?? null, nowIso(), c.req.param('id'))
        .run();
      if (!res.meta.changes) fail(404, 'not_found', `${label}が見つかりません`);
    } catch (e) {
      if (isUniqueViolation(e)) duplicate();
      throw e;
    }
    return c.json({ ok: true });
  });

  /** 並べ替え。ids は全部の並び（足りない・知らない ID があれば断る） */
  app.post('/reorder', async (c) => {
    const { ids } = await parseJson(c, z.object({ ids: z.array(z.string().max(64)).max(MAX_TAGS) }));
    const current = await listTags(c.env.DB, table);
    if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.some((t) => t.id === id))) {
      fail(409, 'stale_order', `${label}が変わっています。画面を読み直してください`);
    }
    await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).bind(i, id)));
    return c.json({ ok: true });
  });

  /** 使っているメモの数（消す前の確認に出す） */
  app.get('/:id/usage', async (c) => {
    const sql =
      table === 'stores'
        ? 'SELECT COUNT(*) AS n FROM memo_offers o JOIN memos m ON m.id = o.memo_id WHERE o.store_id = ? AND m.deleted_at IS NULL'
        : 'SELECT COUNT(*) AS n FROM memos WHERE genre_id = ? AND deleted_at IS NULL';
    const row = await c.env.DB.prepare(sql).bind(c.req.param('id')).first<{ n: number }>();
    return c.json({ memos: row?.n ?? 0 });
  });

  /**
   * 消す。moveTo を渡すと、使っているメモをそちらへ移してから消す。
   * 購入先を移すとき、移し先の候補がすでにあるメモは、移し先の候補を残す（消す方の値段・リンクは消える）
   */
  app.delete('/:id', async (c) => {
    const { moveTo } = await parseJson(c, z.object({ moveTo: z.string().max(64).nullable().default(null) }));
    const id = c.req.param('id');
    const db = c.env.DB;
    if (moveTo === id) fail(400, 'validation_error', '同じものには移せません');
    if (moveTo && !(await db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).bind(moveTo).first())) fail(400, 'not_found', `移し先の${label}が見つかりません`);
    const moves =
      !moveTo
        ? []
        : table === 'stores'
          ? [
              db
                .prepare('UPDATE memo_offers SET store_id = ? WHERE store_id = ? AND memo_id NOT IN (SELECT memo_id FROM memo_offers WHERE store_id = ?)')
                .bind(moveTo, id, moveTo),
            ]
          : [db.prepare('UPDATE memos SET genre_id = ? WHERE genre_id = ?').bind(moveTo, id)];
    // 移さなかった分は、外部キーの決まりで候補が消える（購入先）・ジャンルが外れる（ジャンル）
    const res = await db.batch([...moves, db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id)]);
    if (!res[res.length - 1]!.meta.changes) fail(404, 'not_found', `${label}が見つかりません`);
    return c.json({ ok: true });
  });

  return app;
}

export const stores = tagRoutes('stores');
export const genres = tagRoutes('genres');
