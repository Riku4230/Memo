import { env, SELF } from 'cloudflare:test';
import { DEFAULT_GENRES, DEFAULT_STORES } from '../../src/worker/defaults';
import { randomToken, sha256 } from '../../src/worker/lib/crypto';

export const ORIGIN = 'http://localhost';

export interface TestUser {
  id: string;
  cookie: string;
  sessionHash: string;
}

/** 購入先・ジャンルの初期値を入れる（本番ではセットアップのときに作る）。何度呼んでもよい */
export async function seedTags(): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch([
    ...DEFAULT_STORES.map((t, i) =>
      env.DB.prepare('INSERT OR IGNORE INTO stores (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
        crypto.randomUUID(), t.name, t.icon, t.color, i, now, now,
      ),
    ),
    ...DEFAULT_GENRES.map((t, i) =>
      env.DB.prepare('INSERT OR IGNORE INTO genres (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
        crypto.randomUUID(), t.name, t.icon, t.color, i, now, now,
      ),
    ),
  ]);
}

export async function storeId(name: string): Promise<string> {
  const row = await env.DB.prepare('SELECT id FROM stores WHERE name = ?').bind(name).first<{ id: string }>();
  if (!row) throw new Error(`store not found: ${name}`);
  return row.id;
}

export async function genreId(name: string): Promise<string> {
  const row = await env.DB.prepare('SELECT id FROM genres WHERE name = ?').bind(name).first<{ id: string }>();
  if (!row) throw new Error(`genre not found: ${name}`);
  return row.id;
}

/** パスキー登録を経ずに、利用者とログイン済みセッションを直接作る */
export async function createUser(opts: { role?: 'owner' | 'member'; name?: string; authAgeMs?: number } = {}): Promise<TestUser> {
  const id = crypto.randomUUID();
  const now = new Date();
  const iso = now.toISOString();
  const token = randomToken(32);
  const sessionHash = await sha256(token);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, name, role, created_at) VALUES (?, ?, ?, ?)').bind(id, opts.name ?? 'テスト', opts.role ?? 'member', iso),
    env.DB.prepare(
      'INSERT INTO sessions (id_hash, user_id, user_agent, created_at, last_seen_at, auth_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(sessionHash, id, 'test', iso, iso, new Date(now.getTime() - (opts.authAgeMs ?? 0)).toISOString(), new Date(now.getTime() + 86_400_000).toISOString()),
    env.DB.prepare(
      "INSERT INTO credentials (id, user_id, public_key, counter, transports, device_name, created_at) VALUES (?, ?, 'x', 0, '[]', 'テスト端末', ?)",
    ).bind(`cred-${id}`, id, iso),
  ]);
  await seedTags();
  return { id, cookie: `__Host-memo_session=${token}`, sessionHash };
}

/** Worker に API リクエストを送る。user を渡すとログイン状態で、本文があれば JSON で送る */
export async function call(method: string, path: string, opts: { user?: TestUser; body?: unknown; origin?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (opts.user) headers.cookie = opts.user.cookie;
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  let body: BodyInit | undefined;
  if (typeof opts.body === 'string') body = opts.body;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await SELF.fetch(`${ORIGIN}/api${path}`, { method, headers, body });
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false }).decode(bytes);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json: json as any, text, headers: res.headers };
}
