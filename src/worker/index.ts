import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv, Env } from './env';
import { fail } from './lib/http';
import { requireAuth } from './lib/session';
import { admin } from './routes/admin';
import { auth } from './routes/auth';
import { exportCsv } from './routes/export';
import { appData, memos, revision } from './routes/memos';
import { categories } from './routes/categories';
import { voice } from './routes/voice';
import { runMaintenance } from './services/maintenance';

// 2人の家計簿から呼ぶ窓口（サービスバインディングだけ。URL は持たない）
export { KakeiboBridge } from './bridge';

const app = new Hono<AppEnv>();

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    strictTransportSecurity: 'max-age=63072000; includeSubDomains',
    referrerPolicy: 'no-referrer',
    xFrameOptions: 'DENY',
    crossOriginResourcePolicy: 'same-origin',
  }),
);

app.use('/api/*', async (c, next) => {
  c.header('cache-control', 'private, no-store');
  c.header('x-robots-tag', 'noindex, nofollow');
  // CSRF 対策：変更系リクエストは自サイトからのものだけ受け付ける
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const expected = c.env.APP_ORIGIN ?? new URL(c.req.url).origin;
    if (c.req.header('origin') !== expected) fail(403, 'bad_origin', '不正なリクエストです');
  }
  await next();
});

// リクエスト本文の大きさの上限。ストリームで数えるため、Content-Length のない送信にも効く
const JSON_LIMIT = 128 * 1024;
const jsonLimit = bodyLimit({ maxSize: JSON_LIMIT, onError: () => fail(413, 'too_large', '送信データが大きすぎます') });
// 音声入力は音声そのものを送るので、ここではなく routes/voice.ts で別の上限を付ける
app.use('/api/*', (c, next) => (c.req.path === '/api/voice' ? next() : jsonLimit(c, next)));

// /api/auth 以外はすべてログイン必須
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/')) return next();
  return requireAuth(c, next);
});

app.route('/api/auth', auth);
app.get('/api/data', appData);
app.get('/api/revision', revision);
app.route('/api/memos', memos);
app.route('/api/categories', categories);
app.route('/api/export.csv', exportCsv);
app.route('/api/admin', admin);
app.route('/api/voice', voice);

app.all('/api/*', () => fail(404, 'not_found', '見つかりません'));

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  // 内部エラーの詳細はレスポンスに含めない
  console.error(err);
  return c.json({ error: { code: 'internal_error', message: 'サーバーでエラーが発生しました' } }, 500);
});

export default {
  fetch: app.fetch,
  // wrangler.jsonc の triggers.crons：毎日の後片付け
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runMaintenance(env).then((r) => console.log(`maintenance: purged ${r.memos} deleted memos`)));
  },
} satisfies ExportedHandler<Env>;
