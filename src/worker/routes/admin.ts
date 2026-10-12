import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { InviteInfo, MemberInfo } from '../../shared/types';
import type { AppEnv } from '../env';
import { randomToken, sha256 } from '../lib/crypto';
import { fail, nowIso, parseJson } from '../lib/http';
import { logAuthEvent } from '../lib/session';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_INVITES = 10;

/** 管理者（最初にセットアップした利用者）だけが使える */
const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const row = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(c.get('userId')).first<{ role: string }>();
  if (row?.role !== 'owner') fail(403, 'forbidden', '管理者だけが操作できます');
  await next();
};

export const admin = new Hono<AppEnv>();
admin.use('*', requireOwner);

admin.get('/invites', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.note, i.created_at, i.expires_at, i.used_at, i.revoked_at, u.name AS used_by_name
     FROM invites i LEFT JOIN users u ON u.id = i.used_by
     WHERE i.created_by = ? ORDER BY i.created_at DESC LIMIT 50`,
  )
    .bind(c.get('userId'))
    .all<{ id: string; note: string; created_at: string; expires_at: string; used_at: string | null; revoked_at: string | null; used_by_name: string | null }>();
  const now = nowIso();
  return c.json<InviteInfo[]>(
    results.map((r) => ({
      id: r.id,
      note: r.note,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      status: r.used_at ? 'used' : r.revoked_at ? 'revoked' : r.expires_at <= now ? 'expired' : 'pending',
      usedByName: r.used_by_name,
    })),
  );
});

admin.post('/invites', async (c) => {
  const body = await parseJson(c, z.object({ note: z.string().trim().max(30).default('') }));
  const userId = c.get('userId');
  const pending = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM invites WHERE created_by = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?',
  )
    .bind(userId, nowIso())
    .first<{ n: number }>();
  if ((pending?.n ?? 0) >= MAX_PENDING_INVITES) fail(409, 'too_many_invites', '未使用の招待が多すぎます。不要な招待を取り消してください');

  // 256ビットの乱数。保存するのはハッシュだけで、リンクはこの1回しか表示しない
  const token = randomToken(32);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  await c.env.DB.prepare('INSERT INTO invites (id, token_hash, note, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, await sha256(token), body.note, userId, nowIso(), expiresAt)
    .run();
  await logAuthEvent(c, userId, 'invite_created');
  const origin = c.env.APP_ORIGIN ?? new URL(c.req.url).origin;
  // トークンは # 以降に置く（サーバーのアクセスログや Referer に残らない）
  return c.json({ id, url: `${origin}/#invite=${token}`, expiresAt }, 201);
});

admin.delete('/invites/:id', async (c) => {
  const res = await c.env.DB.prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND created_by = ? AND used_at IS NULL AND revoked_at IS NULL')
    .bind(nowIso(), c.req.param('id'), c.get('userId'))
    .run();
  if (!res.meta.changes) fail(404, 'not_found', '取り消せる招待がありません');
  return c.json({ ok: true });
});

admin.get('/members', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.role, u.created_at,
            (SELECT MAX(last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at,
            (SELECT COUNT(*) FROM memos m WHERE m.created_by = u.id AND m.deleted_at IS NULL) AS memo_count
     FROM users u ORDER BY u.role = 'owner' DESC, u.created_at`,
  ).all<{ id: string; name: string; role: 'owner' | 'member'; created_at: string; last_seen_at: string | null; memo_count: number }>();
  return c.json<MemberInfo[]>(
    results.map((r) => ({ id: r.id, name: r.name, role: r.role, createdAt: r.created_at, lastSeenAt: r.last_seen_at, memoCount: r.memo_count })),
  );
});

/** メンバーを削除する。ログイン情報は消えるが、メモ帳は共有なので、その人が追加したメモは残る（追加した人の表示が消える） */
admin.delete('/members/:id', async (c) => {
  const id = c.req.param('id');
  if (id === c.get('userId')) fail(400, 'validation_error', '自分自身は削除できません');
  const res = await c.env.DB.prepare("DELETE FROM users WHERE id = ? AND role = 'member'").bind(id).run();
  if (!res.meta.changes) fail(404, 'not_found', 'メンバーが見つかりません');
  await logAuthEvent(c, c.get('userId'), 'member_removed');
  return c.json({ ok: true });
});
