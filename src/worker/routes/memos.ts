import { Hono, type Context } from 'hono';
import { memoCreate, memoUpdate } from '../../shared/schemas';
import type { AppDataResponse, Memo, Offer, MemoLink } from '../../shared/types';
import type { AppEnv } from '../env';
import { fail, isUniqueViolation, nowIso, parseJson } from '../lib/http';
import { listTags } from './tags';

type Db = D1Database;

interface MemoRow {
  id: string;
  title: string;
  body: string;
  genre_id: string | null;
  done_at: string | null;
  done_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
interface OfferRow {
  memo_id: string;
  store_id: string;
  price: number | null;
  url: string;
  note: string;
  checked_on: string | null;
}
interface LinkRow {
  memo_id: string;
  url: string;
  label: string;
}

const MEMO_COLUMNS = 'id, title, body, genre_id, done_at, done_by, created_by, created_at, updated_at';
/** 一度に返すメモの数の上限（2人で使う規模では届かない。届いたら古いものから省く） */
const MAX_MEMOS = 5000;

function toMemo(row: MemoRow, offers: OfferRow[], links: LinkRow[]): Memo {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    genreId: row.genre_id,
    offers: offers.map((o) => ({ storeId: o.store_id, price: o.price, url: o.url, note: o.note, checkedOn: o.checked_on })),
    links: links.map((l) => ({ url: l.url, label: l.label })),
    doneAt: row.done_at,
    doneBy: row.done_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function groupBy<T extends { memo_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.memo_id);
    if (list) list.push(r);
    else map.set(r.memo_id, [r]);
  }
  return map;
}

/** 消していないメモをすべて（候補・リンクつきで）読む。3回の問い合わせを1往復で行う */
export async function listMemos(db: Db): Promise<Memo[]> {
  const live = 'SELECT id FROM memos WHERE deleted_at IS NULL';
  const [memos, offers, links] = await db.batch([
    db.prepare(`SELECT ${MEMO_COLUMNS} FROM memos WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ${MAX_MEMOS}`),
    db.prepare(`SELECT memo_id, store_id, price, url, note, checked_on FROM memo_offers WHERE memo_id IN (${live}) ORDER BY memo_id, sort_order`),
    db.prepare(`SELECT memo_id, url, label FROM memo_links WHERE memo_id IN (${live}) ORDER BY memo_id, sort_order`),
  ]);
  const offerMap = groupBy(offers!.results as unknown as OfferRow[]);
  const linkMap = groupBy(links!.results as unknown as LinkRow[]);
  return (memos!.results as unknown as MemoRow[]).map((m) => toMemo(m, offerMap.get(m.id) ?? [], linkMap.get(m.id) ?? []));
}

async function getMemo(db: Db, id: string): Promise<Memo | null> {
  const [memo, offers, links] = await db.batch([
    db.prepare(`SELECT ${MEMO_COLUMNS} FROM memos WHERE id = ? AND deleted_at IS NULL`).bind(id),
    db.prepare('SELECT memo_id, store_id, price, url, note, checked_on FROM memo_offers WHERE memo_id = ? ORDER BY sort_order').bind(id),
    db.prepare('SELECT memo_id, url, label FROM memo_links WHERE memo_id = ? ORDER BY sort_order').bind(id),
  ]);
  const row = memo!.results[0] as unknown as MemoRow | undefined;
  return row ? toMemo(row, offers!.results as unknown as OfferRow[], links!.results as unknown as LinkRow[]) : null;
}

async function requireMemo(db: Db, id: string): Promise<Memo> {
  const memo = await getMemo(db, id);
  if (!memo) fail(404, 'not_found', 'メモが見つかりません。ほかの人が消したかもしれません');
  return memo;
}

/** 指定されたジャンル・購入先が、すべてあるか確かめる（消されたものを指していたら断る） */
async function assertTagsExist(db: Db, genreId: string | null | undefined, storeIds: string[]): Promise<void> {
  if (genreId) {
    const g = await db.prepare('SELECT 1 FROM genres WHERE id = ?').bind(genreId).first();
    if (!g) fail(400, 'unknown_genre', 'このジャンルはもうありません。画面を読み直してください');
  }
  if (storeIds.length) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM stores WHERE id IN (${storeIds.map(() => '?').join(',')})`)
      .bind(...storeIds)
      .first<{ n: number }>();
    if ((row?.n ?? 0) !== storeIds.length) fail(400, 'unknown_store', 'この購入先はもうありません。画面を読み直してください');
  }
}

/**
 * 候補とリンクを置き換える文。guard を渡すと、その条件（メモの更新日時が今回のものになっている）のときだけ動く。
 * 同時に保存したとき、内容の更新に負けた側の候補・リンクが混ざらないようにする
 */
function replaceChildren(db: Db, memoId: string, now: string, offers: Offer[] | undefined, links: MemoLink[] | undefined, guard: string | null) {
  const cond = guard ? ' AND EXISTS (SELECT 1 FROM memos WHERE id = ? AND updated_at = ?)' : '';
  const guardArgs = guard ? [memoId, guard] : [];
  const stmts: D1PreparedStatement[] = [];
  if (offers) {
    stmts.push(db.prepare(`DELETE FROM memo_offers WHERE memo_id = ?${cond}`).bind(memoId, ...guardArgs));
    offers.forEach((o, i) =>
      stmts.push(
        db
          .prepare(
            `INSERT INTO memo_offers (id, memo_id, store_id, price, url, note, checked_on, sort_order, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE 1${cond}`,
          )
          .bind(crypto.randomUUID(), memoId, o.storeId, o.price, o.url, o.note, o.checkedOn, i, now, ...guardArgs),
      ),
    );
  }
  if (links) {
    stmts.push(db.prepare(`DELETE FROM memo_links WHERE memo_id = ?${cond}`).bind(memoId, ...guardArgs));
    links.forEach((l, i) =>
      stmts.push(
        db
          .prepare(`INSERT INTO memo_links (id, memo_id, url, label, sort_order, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE 1${cond}`)
          .bind(crypto.randomUUID(), memoId, l.url, l.label, i, now, ...guardArgs),
      ),
    );
  }
  return stmts;
}

/** 同じミリ秒に2回保存しても更新日時が重ならないよう、前の値より後の時刻にする */
function nextTimestamp(prev: string | null): string {
  const now = Date.now();
  const base = prev ? Math.max(now, Date.parse(prev) + 1) : now;
  return new Date(base).toISOString();
}

export const memos = new Hono<AppEnv>();

memos.post('/', async (c) => {
  const body = await parseJson(c, memoCreate);
  const db = c.env.DB;
  // 送り直し（電波が切れて返事が届かなかった）なら、前に作ったメモを返す
  if (body.clientId) {
    const prev = await db.prepare('SELECT id FROM memos WHERE client_id = ?').bind(body.clientId).first<{ id: string }>();
    if (prev) return c.json(await requireMemo(db, prev.id));
  }
  await assertTagsExist(db, body.genreId, body.offers.map((o) => o.storeId));
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    await db.batch([
      db
        .prepare('INSERT INTO memos (id, title, body, genre_id, client_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, body.title, body.body, body.genreId, body.clientId ?? null, c.get('userId'), now, now),
      ...replaceChildren(db, id, now, body.offers, body.links, null),
    ]);
  } catch (e) {
    if (body.clientId && isUniqueViolation(e)) {
      const prev = await db.prepare('SELECT id FROM memos WHERE client_id = ?').bind(body.clientId).first<{ id: string }>();
      if (prev) return c.json(await requireMemo(db, prev.id));
    }
    throw e;
  }
  return c.json(await requireMemo(db, id), 201);
});

memos.get('/:id', async (c) => c.json(await requireMemo(c.env.DB, c.req.param('id'))));

memos.patch('/:id', async (c) => {
  const body = await parseJson(c, memoUpdate);
  const db = c.env.DB;
  const id = c.req.param('id');
  const current = await requireMemo(db, id);
  if (body.baseUpdatedAt && body.baseUpdatedAt !== current.updatedAt) {
    fail(409, 'conflict', 'ほかの人が先に更新しました。最新の内容を読み直したので、もう一度直してください');
  }
  await assertTagsExist(db, body.genreId, body.offers?.map((o) => o.storeId) ?? []);
  const now = nextTimestamp(current.updatedAt);
  const res = await db.batch([
    db
      .prepare(
        `UPDATE memos SET title = COALESCE(?, title), body = COALESCE(?, body), genre_id = CASE WHEN ? THEN ? ELSE genre_id END, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL AND updated_at = ?`,
      )
      .bind(body.title ?? null, body.body ?? null, body.genreId !== undefined ? 1 : 0, body.genreId ?? null, now, id, current.updatedAt),
    ...replaceChildren(db, id, now, body.offers, body.links, now),
  ]);
  // 読んでから書くまでの間に、ほかの人が保存していた（その場合は候補・リンクも書き換わっていない）
  if (!res[0]!.meta.changes) fail(409, 'conflict', 'ほかの人が先に更新しました。最新の内容を読み直したので、もう一度直してください');
  return c.json(await requireMemo(db, id));
});

/** 買ったを付ける。もう付いていればそのまま（2人が同時に押しても、先に押した人の記録を残す） */
memos.put('/:id/done', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE memos SET done_at = ?, done_by = ? WHERE id = ? AND deleted_at IS NULL AND done_at IS NULL')
    .bind(nowIso(), c.get('userId'), id)
    .run();
  return c.json(await requireMemo(c.env.DB, id));
});

memos.delete('/:id/done', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE memos SET done_at = NULL, done_by = NULL WHERE id = ? AND deleted_at IS NULL').bind(id).run();
  return c.json(await requireMemo(c.env.DB, id));
});

/** 消す。7日間は「元に戻す」で戻せるよう、印を付けるだけにする（毎日の後片付けで本当に消す） */
memos.delete('/:id', async (c) => {
  const res = await c.env.DB.prepare('UPDATE memos SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').bind(nowIso(), c.req.param('id')).run();
  if (!res.meta.changes) fail(404, 'not_found', 'メモが見つかりません。ほかの人が消したかもしれません');
  return c.json({ ok: true });
});

memos.post('/:id/restore', async (c) => {
  const id = c.req.param('id');
  const res = await c.env.DB.prepare('UPDATE memos SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL').bind(id).run();
  if (!res.meta.changes) fail(404, 'not_found', '元に戻せるメモがありません');
  return c.json(await requireMemo(c.env.DB, id));
});

/** 画面を開いたときに読む、メモ帳の全部（購入先・ジャンル・メモ） */
export async function appData(c: Context<AppEnv>) {
  const [stores, genres, memoList] = await Promise.all([listTags(c.env.DB, 'stores'), listTags(c.env.DB, 'genres'), listMemos(c.env.DB)]);
  return c.json<AppDataResponse>({ stores, genres, memos: memoList });
}
