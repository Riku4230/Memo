import { Hono, type Context } from 'hono';
import { memoCreate, memoUpdate } from '../../shared/schemas';
import type { AppDataResponse, RevisionResponse, Memo, MemoLink } from '../../shared/types';
import type { AppEnv } from '../env';
import { fail, isUniqueViolation, nowIso, parseJson } from '../lib/http';
import { listCategories } from './categories';

type Db = D1Database;

interface MemoRow {
  id: string;
  title: string;
  body: string;
  category_id: string | null;
  subcategory_id: string | null;
  price: number | null;
  done_at: string | null;
  done_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
interface LinkRow {
  memo_id: string;
  url: string;
  label: string;
}

const MEMO_COLUMNS = 'id, title, body, category_id, subcategory_id, price, done_at, done_by, created_by, created_at, updated_at';
/** 一度に返すメモの数の上限（2人で使う規模では届かない。届いたら古いものから省く） */
const MAX_MEMOS = 5000;

function toMemo(row: MemoRow, links: LinkRow[]): Memo {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    price: row.price,
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

/** 消していないメモをすべて（リンクつきで）読む。2回の問い合わせを1往復で行う */
export async function listMemos(db: Db): Promise<Memo[]> {
  const live = 'SELECT id FROM memos WHERE deleted_at IS NULL';
  const [memos, links] = await db.batch([
    db.prepare(`SELECT ${MEMO_COLUMNS} FROM memos WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ${MAX_MEMOS}`),
    db.prepare(`SELECT memo_id, url, label FROM memo_links WHERE memo_id IN (${live}) ORDER BY memo_id, sort_order`),
  ]);
  const linkMap = groupBy(links!.results as unknown as LinkRow[]);
  return (memos!.results as unknown as MemoRow[]).map((m) => toMemo(m, linkMap.get(m.id) ?? []));
}

async function getMemo(db: Db, id: string): Promise<Memo | null> {
  const [memo, links] = await db.batch([
    db.prepare(`SELECT ${MEMO_COLUMNS} FROM memos WHERE id = ? AND deleted_at IS NULL`).bind(id),
    db.prepare('SELECT memo_id, url, label FROM memo_links WHERE memo_id = ? ORDER BY sort_order').bind(id),
  ]);
  const row = memo!.results[0] as unknown as MemoRow | undefined;
  return row ? toMemo(row, links!.results as unknown as LinkRow[]) : null;
}

async function requireMemo(db: Db, id: string): Promise<Memo> {
  const memo = await getMemo(db, id);
  if (!memo) fail(404, 'not_found', 'メモが見つかりません。ほかの人が消したかもしれません');
  return memo;
}

/** 大カテゴリ・中カテゴリがあるか、中カテゴリがその大カテゴリの中のものかを確かめる（消されたものを指していたら断る） */
async function assertCategory(db: Db, categoryId: string | null, subcategoryId: string | null): Promise<void> {
  if (subcategoryId && !categoryId) fail(400, 'validation_error', '中カテゴリだけを選ぶことはできません');
  if (categoryId && !(await db.prepare('SELECT 1 FROM categories WHERE id = ?').bind(categoryId).first())) {
    fail(400, 'unknown_category', 'この大カテゴリはもうありません。画面を読み直してください');
  }
  if (subcategoryId && !(await db.prepare('SELECT 1 FROM subcategories WHERE id = ? AND category_id = ?').bind(subcategoryId, categoryId).first())) {
    fail(400, 'unknown_subcategory', 'この中カテゴリはもうありません。画面を読み直してください');
  }
}

/**
 * リンクを置き換える文。guard を渡すと、その条件（メモの更新日時が今回のものになっている）のときだけ動く。
 * 同時に保存したとき、内容の更新に負けた側のリンクが混ざらないようにする
 */
function replaceLinks(db: Db, memoId: string, now: string, links: MemoLink[] | undefined, guard: string | null) {
  if (!links) return [];
  const cond = guard ? ' AND EXISTS (SELECT 1 FROM memos WHERE id = ? AND updated_at = ?)' : '';
  const guardArgs = guard ? [memoId, guard] : [];
  return [
    db.prepare(`DELETE FROM memo_links WHERE memo_id = ?${cond}`).bind(memoId, ...guardArgs),
    ...links.map((l, i) =>
      db
        .prepare(`INSERT INTO memo_links (id, memo_id, url, label, sort_order, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE 1${cond}`)
        .bind(crypto.randomUUID(), memoId, l.url, l.label, i, now, ...guardArgs),
    ),
  ];
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
  await assertCategory(db, body.categoryId, body.subcategoryId);
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO memos (id, title, body, category_id, subcategory_id, price, client_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(id, body.title, body.body, body.categoryId, body.subcategoryId, body.price, body.clientId ?? null, c.get('userId'), now, now),
      ...replaceLinks(db, id, now, body.links, null),
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
  // 大カテゴリを送ってきたときは、中カテゴリも組で置き換える（送ってこなければ中カテゴリなし）
  const setCategory = body.categoryId !== undefined;
  const categoryId = setCategory ? body.categoryId! : current.categoryId;
  const subcategoryId = setCategory ? (body.subcategoryId ?? null) : body.subcategoryId !== undefined ? body.subcategoryId : current.subcategoryId;
  await assertCategory(db, categoryId, subcategoryId);
  const now = nextTimestamp(current.updatedAt);
  const res = await db.batch([
    db
      .prepare(
        `UPDATE memos SET title = COALESCE(?, title), body = COALESCE(?, body), category_id = ?, subcategory_id = ?, price = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL AND updated_at = ?`,
      )
      .bind(body.title ?? null, body.body ?? null, categoryId, subcategoryId, body.price !== undefined ? body.price : current.price, now, id, current.updatedAt),
    ...replaceLinks(db, id, now, body.links, now),
  ]);
  // 読んでから書くまでの間に、ほかの人が保存していた（その場合はリンクも書き換わっていない）
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

/** 画面を開いたときに読む、メモ帳の全部（大カテゴリ・中カテゴリ・メモ） */
/** 「変わった番号」。メモ・リンク・大カテゴリ・中カテゴリが変わるたびに DB のトリガーで 1 ずつ上がる */
async function readRevision(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT revision FROM sync_state WHERE id = 1').first<{ revision: number }>();
  return row?.revision ?? 0;
}

export async function appData(c: Context<AppEnv>) {
  // 番号はデータより先に読む。読んでいる間に変わっても、番号が古いほうにずれるだけなので、次の確認でもう一度読み直される
  const revision = await readRevision(c.env.DB);
  const [categoryList, memoList] = await Promise.all([listCategories(c.env.DB), listMemos(c.env.DB)]);
  return c.json<AppDataResponse>({ categories: categoryList, memos: memoList, revision });
}

/** 画面が15秒おきなどに聞く、変わったかどうかだけの軽い確認（1行だけ読む） */
export async function revision(c: Context<AppEnv>) {
  return c.json<RevisionResponse>({ revision: await readRevision(c.env.DB) });
}
