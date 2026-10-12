// Kakeibo の src/worker/lib/session.ts から（Kakeibo 側で直したら合わせる）
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../env';
import { randomToken, sha256 } from './crypto';
import { fail, nowIso } from './http';

export const SESSION_COOKIE = '__Host-memo_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
/** 最終アクセスの更新は書き込みを減らすため1時間に1回まで */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken(32);
  const now = new Date();
  await c.env.DB.prepare(
    'INSERT INTO sessions (id_hash, user_id, user_agent, created_at, last_seen_at, auth_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      await sha256(token),
      userId,
      (c.req.header('user-agent') ?? '').slice(0, 300),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
      new Date(now.getTime() + SESSION_MS).toISOString(),
    )
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function currentSession(c: Context<AppEnv>): Promise<{ userId: string; idHash: string } | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const idHash = await sha256(token);
  const row = await c.env.DB.prepare('SELECT user_id, last_seen_at, expires_at FROM sessions WHERE id_hash = ?')
    .bind(idHash)
    .first<{ user_id: string; last_seen_at: string; expires_at: string }>();
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(idHash).run();
    return null;
  }
  if (now - Date.parse(row.last_seen_at) > TOUCH_INTERVAL_MS) {
    // 最終アクセスから30日の有効期限を延長する
    await c.env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?')
      .bind(new Date(now).toISOString(), new Date(now + SESSION_MS).toISOString(), idHash)
      .run();
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
  }
  return { userId: row.user_id, idHash };
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
}


export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await currentSession(c);
  if (!session) fail(401, 'unauthorized', 'ログインが必要です');
  c.set('userId', session.userId);
  c.set('sessionHash', session.idHash);
  await next();
};

/** 本人確認から何分以内なら、重要な操作を許可するか */
const RECENT_AUTH_MS = 10 * 60 * 1000;

/**
 * リカバリーコードの再発行やパスキーの追加・削除の前に、直近の本人確認を求める（§13.2）。
 * ログインしたままの端末を他人に使われても、パスキー（生体認証）なしでは乗っ取りを続けられないようにする。
 * requireAuth の後に使う。
 */
export const requireRecentAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const row = await c.env.DB.prepare('SELECT auth_at FROM sessions WHERE id_hash = ?')
    .bind(c.get('sessionHash'))
    .first<{ auth_at: string | null }>();
  if (!row?.auth_at || Date.now() - Date.parse(row.auth_at) > RECENT_AUTH_MS) {
    fail(403, 'reauth_required', '続けるには本人確認が必要です');
  }
  await next();
};

export async function logAuthEvent(c: Context<AppEnv>, userId: string | null, event: string): Promise<void> {
  await c.env.DB.prepare('INSERT INTO auth_logs (id, user_id, event, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(
      crypto.randomUUID(),
      userId,
      event,
      c.req.header('cf-connecting-ip') ?? 'local',
      (c.req.header('user-agent') ?? '').slice(0, 300),
      nowIso(),
    )
    .run();
}
