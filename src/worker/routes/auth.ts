// Kakeibo の src/worker/routes/auth.ts から（Kakeibo 側で直したら合わせる）
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { deviceName } from '../../shared/schemas';
import type { Me, PasskeyInfo, SessionInfo } from '../../shared/types';
import { DEFAULT_GENRES, DEFAULT_STORES } from '../defaults';
import type { AppEnv } from '../env';
import { base64url, fromBase64url, normalizeRecoveryCode, recoveryCode, sha256, timingSafeEqualString } from '../lib/crypto';
import { clientIp, fail, isUniqueViolation, nowIso, parseJson } from '../lib/http';
import { createSession, currentSession, destroySession, logAuthEvent, requireAuth, requireRecentAuth } from '../lib/session';

const CHALLENGE_COOKIE = '__Host-memo_challenge';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const RECOVERY_CODE_COUNT = 10;
/** 同じ IP が有効期限内（5分）に持てるチャレンジの数。ログイン前でも作れるため、大量作成を防ぐ */
const MAX_CHALLENGES_PER_IP = 30;

type ChallengeKind = 'setup' | 'add' | 'login' | 'invite' | 'reauth';

function rp(c: Context<AppEnv>): { origin: string; rpID: string } {
  const origin = c.env.APP_ORIGIN ?? new URL(c.req.url).origin;
  return { origin, rpID: new URL(origin).hostname };
}

async function setupRequired(c: Context<AppEnv>): Promise<boolean> {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  return (row?.n ?? 0) === 0;
}

// ---- 試行回数制限（§13.2） ----
async function assertNotLocked(c: Context<AppEnv>): Promise<void> {
  const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM auth_failures WHERE ip = ? AND at > ?')
    .bind(clientIp(c), since)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= MAX_FAILURES) {
    fail(429, 'too_many_attempts', '試行回数が多すぎます。15分ほど待ってから再度お試しください');
  }
}

async function recordFailure(c: Context<AppEnv>, event: string): Promise<void> {
  const cutoff = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO auth_failures (ip, at) VALUES (?, ?)').bind(clientIp(c), nowIso()),
    c.env.DB.prepare('DELETE FROM auth_failures WHERE at < ?').bind(cutoff),
  ]);
  await logAuthEvent(c, null, event);
}

// ---- チャレンジ（使い捨て、5分有効） ----
async function saveChallenge(c: Context<AppEnv>, challenge: string, kind: ChallengeKind, userId: string | null, inviteId: string | null = null) {
  const id = crypto.randomUUID();
  const ip = clientIp(c);
  const active = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM auth_challenges WHERE ip = ? AND expires_at > ?')
    .bind(ip, nowIso())
    .first<{ n: number }>();
  if ((active?.n ?? 0) >= MAX_CHALLENGES_PER_IP) fail(429, 'too_many_attempts', '試行回数が多すぎます。数分待ってから再度お試しください');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM auth_challenges WHERE expires_at < ?').bind(nowIso()),
    c.env.DB.prepare('INSERT INTO auth_challenges (id, challenge, kind, user_id, invite_id, ip, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      id,
      challenge,
      kind,
      userId,
      inviteId,
      ip,
      new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    ),
  ]);
  setCookie(c, CHALLENGE_COOKIE, id, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

async function takeChallenge(
  c: Context<AppEnv>,
  kind: ChallengeKind,
): Promise<{ challenge: string; userId: string | null; inviteId: string | null }> {
  const id = getCookie(c, CHALLENGE_COOKIE);
  deleteCookie(c, CHALLENGE_COOKIE, { path: '/', secure: true });
  if (!id) fail(400, 'challenge_missing', '認証の有効期限が切れました。もう一度お試しください');
  const row = await c.env.DB.prepare('DELETE FROM auth_challenges WHERE id = ? RETURNING challenge, kind, user_id, invite_id, expires_at')
    .bind(id)
    .first<{ challenge: string; kind: string; user_id: string | null; invite_id: string | null; expires_at: string }>();
  if (!row || row.kind !== kind || Date.parse(row.expires_at) < Date.now()) {
    fail(400, 'challenge_missing', '認証の有効期限が切れました。もう一度お試しください');
  }
  return { challenge: row.challenge, userId: row.user_id, inviteId: row.invite_id };
}

async function issueRecoveryCodes(c: Context<AppEnv>, userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
  const stmts = [c.env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(userId)];
  for (const code of codes) {
    stmts.push(
      c.env.DB.prepare('INSERT INTO recovery_codes (id, user_id, code_hash, used_at) VALUES (?, ?, ?, NULL)').bind(
        crypto.randomUUID(),
        userId,
        await sha256(code),
      ),
    );
  }
  await c.env.DB.batch(stmts);
  return codes;
}

async function registrationOptions(c: Context<AppEnv>, user: { id: string; name: string }, exclude: { id: string }[]) {
  const { rpID } = rp(c);
  return generateRegistrationOptions({
    rpName: c.env.RP_NAME,
    rpID,
    userName: user.name,
    userDisplayName: user.name,
    userID: new Uint8Array(new TextEncoder().encode(user.id)),
    attestationType: 'none',
    excludeCredentials: exclude,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
}

async function verifyRegistration(c: Context<AppEnv>, response: RegistrationResponseJSON, challenge: string) {
  const { origin, rpID } = rp(c);
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    return result.verified ? result.registrationInfo : null;
  } catch {
    return null;
  }
}

function credentialInsert(
  c: Context<AppEnv>,
  userId: string,
  info: NonNullable<Awaited<ReturnType<typeof verifyRegistration>>>,
  name: string,
) {
  return c.env.DB.prepare(
    'INSERT INTO credentials (id, user_id, public_key, counter, transports, device_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    info.credential.id,
    userId,
    base64url(info.credential.publicKey),
    info.credential.counter,
    JSON.stringify(info.credential.transports ?? []),
    name,
    nowIso(),
  );
}

/**
 * 新しい利用者の作成（利用者・パスキー）。管理者（最初の1人）のときは、メモ帳の初期の購入先・ジャンルも作る
 */
function accountStatements(
  c: Context<AppEnv>,
  account: { userId: string; name: string; role: 'owner' | 'member' },
  info: NonNullable<Awaited<ReturnType<typeof verifyRegistration>>>,
  deviceName: string,
) {
  const now = nowIso();
  const tag = (table: 'stores' | 'genres', t: { name: string; icon: string; color: string }, i: number) =>
    c.env.DB.prepare(`INSERT OR IGNORE INTO ${table} (id, name, icon, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(),
      t.name,
      t.icon,
      t.color,
      i,
      now,
      now,
    );
  return [
    // 管理者は「まだ誰もいないとき」だけ作れる。同時セットアップで2人目の管理者ができないよう、条件付きで挿入する
    // （挿入されなければ後続の行が外部キー違反になり、batch 全体が取り消される）
    account.role === 'owner'
      ? c.env.DB.prepare('INSERT INTO users (id, name, role, created_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)').bind(
          account.userId,
          account.name,
          account.role,
          now,
        )
      : c.env.DB.prepare('INSERT INTO users (id, name, role, created_at) VALUES (?, ?, ?, ?)').bind(account.userId, account.name, account.role, now),
    credentialInsert(c, account.userId, info, deviceName),
    // 購入先・ジャンルはメモ帳に1組だけ。すでにある（前のデータが残っている）ときは作らない
    ...(account.role === 'owner'
      ? [
          ...DEFAULT_STORES.map((t, i) => tag('stores', t, i)),
          ...DEFAULT_GENRES.map((t, i) => tag('genres', t, i)),
        ]
      : []),
  ];
}

/** 有効な招待（未使用・未取り消し・期限内）をトークンから探す */
async function findInvite(c: Context<AppEnv>, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return c.env.DB.prepare(
    'SELECT id, expires_at FROM invites WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?',
  )
    .bind(await sha256(token), nowIso())
    .first<{ id: string; expires_at: string }>();
}

const responseBody = z.object({ response: z.record(z.string(), z.unknown()) });
const inviteToken = z.string().max(200);
const personName = z.string().trim().min(1).max(40);

export const auth = new Hono<AppEnv>();

auth.get('/me', async (c) => {
  const session = await currentSession(c);
  let user: Me['user'] = null;
  let members: Me['members'] = [];
  if (session) {
    const row = await c.env.DB.prepare('SELECT id, name, role, created_at FROM users WHERE id = ?')
      .bind(session.userId)
      .first<{ id: string; name: string; role: 'owner' | 'member'; created_at: string }>();
    user = row && { id: row.id, name: row.name, role: row.role, createdAt: row.created_at };
    // メモ帳を使っている人（追加した人・買った人の名前の表示に使う）
    const { results } = await c.env.DB.prepare('SELECT id, name FROM users ORDER BY created_at').all<{ id: string; name: string }>();
    members = results;
  }
  return c.json<Me>({ user, members, setupRequired: user ? false : await setupRequired(c) });
});

// ---- 初回セットアップ：セットアップ用トークン + 最初のパスキー登録 ----
auth.post('/setup/options', async (c) => {
  await assertNotLocked(c);
  const body = await parseJson(c, z.object({ setupToken: z.string().max(200), name: personName }));
  if (!(await setupRequired(c))) fail(403, 'setup_closed', 'すでにセットアップ済みです');
  if (!c.env.SETUP_TOKEN || !(await timingSafeEqualString(body.setupToken, c.env.SETUP_TOKEN))) {
    await recordFailure(c, 'setup_token_invalid');
    fail(403, 'invalid_setup_token', 'セットアップ用トークンが正しくありません');
  }
  const userId = crypto.randomUUID();
  const options = await registrationOptions(c, { id: userId, name: body.name }, []);
  await saveChallenge(c, options.challenge, 'setup', userId);
  return c.json(options);
});

auth.post('/setup/verify', async (c) => {
  await assertNotLocked(c);
  const body = await parseJson(c, responseBody.extend({ name: personName, deviceName }));
  const { challenge, userId } = await takeChallenge(c, 'setup');
  if (!userId) fail(400, 'challenge_missing', '認証の有効期限が切れました');
  if (!(await setupRequired(c))) fail(403, 'setup_closed', 'すでにセットアップ済みです');
  const info = await verifyRegistration(c, body.response as unknown as RegistrationResponseJSON, challenge);
  if (!info) {
    await recordFailure(c, 'setup_passkey_invalid');
    fail(400, 'verification_failed', 'パスキーを確認できませんでした');
  }
  // 最初の利用者は管理者（招待リンクを発行できる）
  try {
    await c.env.DB.batch(accountStatements(c, { userId, name: body.name, role: 'owner' }, info, body.deviceName));
  } catch (e) {
    // 同時に別の端末でセットアップが完了していた場合
    if (!(await setupRequired(c))) fail(403, 'setup_closed', 'すでにセットアップ済みです');
    throw e;
  }
  const recoveryCodes = await issueRecoveryCodes(c, userId);
  await createSession(c, userId);
  await logAuthEvent(c, userId, 'setup_completed');
  return c.json({ recoveryCodes });
});

// ---- 招待リンクからの登録 ----
// トークンは URL の # 以降に載せ、サーバーのログや Referer に残らないよう本文で受け取る
auth.post('/invite/check', async (c) => {
  await assertNotLocked(c);
  const body = await parseJson(c, z.object({ token: inviteToken }));
  const invite = await findInvite(c, body.token);
  if (!invite) {
    await recordFailure(c, 'invite_invalid');
    fail(404, 'invite_invalid', 'この招待リンクは無効です（使用済み・期限切れ・取り消し済みのいずれか）');
  }
  return c.json({ expiresAt: invite.expires_at });
});

auth.post('/invite/options', async (c) => {
  await assertNotLocked(c);
  const body = await parseJson(c, z.object({ token: inviteToken, name: personName }));
  const invite = await findInvite(c, body.token);
  if (!invite) {
    await recordFailure(c, 'invite_invalid');
    fail(404, 'invite_invalid', 'この招待リンクは無効です（使用済み・期限切れ・取り消し済みのいずれか）');
  }
  const userId = crypto.randomUUID();
  const options = await registrationOptions(c, { id: userId, name: body.name }, []);
  await saveChallenge(c, options.challenge, 'invite', userId, invite.id);
  return c.json(options);
});

auth.post('/invite/verify', async (c) => {
  await assertNotLocked(c);
  const body = await parseJson(c, responseBody.extend({ name: personName, deviceName }));
  const { challenge, userId, inviteId } = await takeChallenge(c, 'invite');
  if (!userId || !inviteId) fail(400, 'challenge_missing', '認証の有効期限が切れました');
  const info = await verifyRegistration(c, body.response as unknown as RegistrationResponseJSON, challenge);
  if (!info) {
    await recordFailure(c, 'invite_passkey_invalid');
    fail(400, 'verification_failed', 'パスキーを確認できませんでした');
  }
  // 招待を「使用済み」にできた場合だけ登録する（同じリンクの同時利用・使い回しを防ぐ）
  const claimed = await c.env.DB.prepare(
    'UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ? RETURNING id',
  )
    .bind(nowIso(), inviteId, nowIso())
    .first<{ id: string }>();
  if (!claimed) fail(404, 'invite_invalid', 'この招待リンクは無効です（使用済み・期限切れ・取り消し済みのいずれか）');
  try {
    await c.env.DB.batch([
      ...accountStatements(c, { userId, name: body.name, role: 'member' }, info, body.deviceName),
      c.env.DB.prepare('UPDATE invites SET used_by = ? WHERE id = ?').bind(userId, inviteId),
    ]);
  } catch (e) {
    // 登録に失敗した場合は招待を未使用に戻す
    await c.env.DB.prepare('UPDATE invites SET used_at = NULL WHERE id = ?').bind(inviteId).run();
    throw e;
  }
  const recoveryCodes = await issueRecoveryCodes(c, userId);
  await createSession(c, userId);
  await logAuthEvent(c, userId, 'invite_accepted');
  return c.json({ recoveryCodes });
});

// ---- ログイン ----
auth.post('/login/options', async (c) => {
  await assertNotLocked(c);
  const options = await generateAuthenticationOptions({ rpID: rp(c).rpID, userVerification: 'required' });
  await saveChallenge(c, options.challenge, 'login', null);
  return c.json(options);
});

auth.post('/login/verify', async (c) => {
  await assertNotLocked(c);
  const body = await parseJson(c, responseBody);
  const response = body.response as unknown as AuthenticationResponseJSON;
  const { challenge } = await takeChallenge(c, 'login');
  const cred = await c.env.DB.prepare('SELECT id, user_id, public_key, counter, transports FROM credentials WHERE id = ?')
    .bind(String(response.id ?? ''))
    .first<{ id: string; user_id: string; public_key: string; counter: number; transports: string | null }>();
  if (!cred) {
    await recordFailure(c, 'login_unknown_credential');
    fail(401, 'login_failed', 'このパスキーは登録されていません');
  }
  const { origin, rpID } = rp(c);
  let verified = false;
  let newCounter = cred.counter;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.id,
        publicKey: fromBase64url(cred.public_key),
        counter: cred.counter,
        transports: cred.transports ? (JSON.parse(cred.transports) as string[]) : undefined,
      },
    });
    verified = result.verified;
    newCounter = result.authenticationInfo.newCounter;
  } catch {
    verified = false;
  }
  if (!verified) {
    await recordFailure(c, 'login_failed');
    fail(401, 'login_failed', 'ログインできませんでした');
  }
  await c.env.DB.prepare('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?').bind(newCounter, nowIso(), cred.id).run();
  await createSession(c, cred.user_id);
  await logAuthEvent(c, cred.user_id, 'login');
  return c.json({ ok: true });
});

// ---- リカバリーコードでのログイン（パスキーを失った場合） ----
auth.post('/recover', async (c) => {
  await assertNotLocked(c);
  const body = await parseJson(c, z.object({ code: z.string().max(40) }));
  const hash = await sha256(normalizeRecoveryCode(body.code));
  const row = await c.env.DB.prepare(
    'UPDATE recovery_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL RETURNING user_id',
  )
    .bind(nowIso(), hash)
    .first<{ user_id: string }>();
  if (!row) {
    await recordFailure(c, 'recovery_failed');
    fail(401, 'recovery_failed', 'リカバリーコードが正しくないか、使用済みです');
  }
  await createSession(c, row.user_id);
  await logAuthEvent(c, row.user_id, 'recovery_login');
  const remaining = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL')
    .bind(row.user_id)
    .first<{ n: number }>();
  return c.json({ remaining: remaining?.n ?? 0 });
});

auth.post('/logout', async (c) => {
  const session = await currentSession(c);
  await destroySession(c);
  if (session) await logAuthEvent(c, session.userId, 'logout');
  return c.json({ ok: true });
});

// ---- 以下はログイン必須 ----

// ---- 再認証（重要な操作の前に、登録済みのパスキーで本人確認する） ----
auth.post('/reauth/options', requireAuth, async (c) => {
  const userId = c.get('userId');
  const { results } = await c.env.DB.prepare('SELECT id, transports FROM credentials WHERE user_id = ?').bind(userId).all<{ id: string; transports: string | null }>();
  const options = await generateAuthenticationOptions({
    rpID: rp(c).rpID,
    userVerification: 'required',
    allowCredentials: results.map((r) => ({ id: r.id, transports: r.transports ? (JSON.parse(r.transports) as string[]) : undefined })),
  });
  await saveChallenge(c, options.challenge, 'reauth', userId);
  return c.json(options);
});

auth.post('/reauth/verify', requireAuth, async (c) => {
  await assertNotLocked(c);
  const userId = c.get('userId');
  const body = await parseJson(c, responseBody);
  const response = body.response as unknown as AuthenticationResponseJSON;
  const { challenge, userId: challengeUser } = await takeChallenge(c, 'reauth');
  if (challengeUser !== userId) fail(403, 'forbidden', '操作できません');
  // 自分のパスキーだけを受け付ける（他人のパスキーでは本人確認にならない）
  const cred = await c.env.DB.prepare('SELECT id, public_key, counter, transports FROM credentials WHERE id = ? AND user_id = ?')
    .bind(String(response.id ?? ''), userId)
    .first<{ id: string; public_key: string; counter: number; transports: string | null }>();
  if (!cred) {
    await recordFailure(c, 'reauth_unknown_credential');
    fail(401, 'reauth_failed', '本人確認できませんでした');
  }
  const { origin, rpID } = rp(c);
  let newCounter = cred.counter;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.id,
        publicKey: fromBase64url(cred.public_key),
        counter: cred.counter,
        transports: cred.transports ? (JSON.parse(cred.transports) as string[]) : undefined,
      },
    });
    if (!result.verified) throw new Error('not verified');
    newCounter = result.authenticationInfo.newCounter;
  } catch {
    await recordFailure(c, 'reauth_failed');
    fail(401, 'reauth_failed', '本人確認できませんでした');
  }
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?').bind(newCounter, now, cred.id),
    c.env.DB.prepare('UPDATE sessions SET auth_at = ? WHERE id_hash = ?').bind(now, c.get('sessionHash')),
  ]);
  await logAuthEvent(c, userId, 'reauth');
  return c.json({ ok: true });
});

auth.get('/passkeys', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, device_name, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at',
  )
    .bind(c.get('userId'))
    .all<{ id: string; device_name: string; created_at: string; last_used_at: string | null }>();
  return c.json<PasskeyInfo[]>(
    results.map((r) => ({ id: r.id, deviceName: r.device_name, createdAt: r.created_at, lastUsedAt: r.last_used_at })),
  );
});

auth.post('/passkeys/options', requireAuth, requireRecentAuth, async (c) => {
  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(userId).first<{ id: string; name: string }>();
  if (!user) fail(401, 'unauthorized', 'ログインが必要です');
  const { results } = await c.env.DB.prepare('SELECT id FROM credentials WHERE user_id = ?').bind(userId).all<{ id: string }>();
  const options = await registrationOptions(c, user, results);
  await saveChallenge(c, options.challenge, 'add', userId);
  return c.json(options);
});

auth.post('/passkeys/verify', requireAuth, requireRecentAuth, async (c) => {
  const body = await parseJson(c, responseBody.extend({ deviceName }));
  const { challenge, userId } = await takeChallenge(c, 'add');
  if (userId !== c.get('userId')) fail(403, 'forbidden', '操作できません');
  const info = await verifyRegistration(c, body.response as unknown as RegistrationResponseJSON, challenge);
  if (!info) fail(400, 'verification_failed', 'パスキーを確認できませんでした');
  try {
    await credentialInsert(c, userId, info, body.deviceName).run();
  } catch (e) {
    if (isUniqueViolation(e)) fail(409, 'duplicate_passkey', 'このパスキーはすでに登録されています');
    throw e;
  }
  await logAuthEvent(c, userId, 'passkey_added');
  return c.json({ ok: true });
});

auth.delete('/passkeys/:id', requireAuth, requireRecentAuth, async (c) => {
  const userId = c.get('userId');
  const exists = await c.env.DB.prepare('SELECT 1 FROM credentials WHERE id = ? AND user_id = ?').bind(c.req.param('id'), userId).first();
  if (!exists) fail(404, 'not_found', 'パスキーが見つかりません');
  // 件数の確認と削除を1文で行い、同時に2つ消して0個になるのを防ぐ
  const res = await c.env.DB.prepare(
    'DELETE FROM credentials WHERE id = ? AND user_id = ? AND (SELECT COUNT(*) FROM credentials WHERE user_id = ?) > 1',
  )
    .bind(c.req.param('id'), userId, userId)
    .run();
  if (!res.meta.changes) fail(409, 'last_passkey', '最後のパスキーは削除できません');
  await logAuthEvent(c, userId, 'passkey_removed');
  return c.json({ ok: true });
});

auth.get('/sessions', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id_hash, user_agent, created_at, last_seen_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC',
  )
    .bind(c.get('userId'), nowIso())
    .all<{ id_hash: string; user_agent: string | null; created_at: string; last_seen_at: string }>();
  return c.json<SessionInfo[]>(
    results.map((r) => ({
      // セッションIDのハッシュ全体は返さず、先頭16文字を識別子にする
      id: r.id_hash.slice(0, 16),
      userAgent: r.user_agent,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      current: r.id_hash === c.get('sessionHash'),
    })),
  );
});

auth.delete('/sessions', requireAuth, async (c) => {
  const userId = c.get('userId');
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  await destroySession(c);
  await logAuthEvent(c, userId, 'logout_all');
  return c.json({ ok: true });
});

auth.delete('/sessions/:id', requireAuth, async (c) => {
  const prefix = c.req.param('id');
  if (!/^[A-Za-z0-9_-]{16}$/.test(prefix)) fail(400, 'validation_error', '不正なIDです');
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND substr(id_hash, 1, 16) = ?')
    .bind(c.get('userId'), prefix)
    .run();
  return c.json({ ok: true });
});

auth.post('/recovery-codes', requireAuth, requireRecentAuth, async (c) => {
  const userId = c.get('userId');
  const recoveryCodes = await issueRecoveryCodes(c, userId);
  await logAuthEvent(c, userId, 'recovery_codes_regenerated');
  return c.json({ recoveryCodes });
});

