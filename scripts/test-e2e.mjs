// ローカルの開発サーバーを起動し、Chromium の画面スモークを実行する。
// スクリーンショットは e2e/screenshots/ に置く（CI がこのディレクトリを成果物にする）。
// ローカルの D1 は空にしてから実行する。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = process.env.E2E_PORT ?? '8787';
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const DEFAULT_TOKEN = 'local-dev-setup-token-1234567890';
const LOG = fileURLToPath(new URL('../e2e/wrangler.log', import.meta.url));

function bin(name) {
  return fileURLToPath(new URL(`../node_modules/.bin/${name}`, import.meta.url));
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} が失敗しました`);
  }
}

function ensureDevVars() {
  const path = `${ROOT}/.dev.vars`;
  if (process.env.GITHUB_ACTIONS === 'true' || !existsSync(path)) {
    writeFileSync(path, `SETUP_TOKEN=${DEFAULT_TOKEN}\n`);
    return DEFAULT_TOKEN;
  }
  const match = readFileSync(path, 'utf8').match(/^SETUP_TOKEN=(.*)$/m);
  return (match?.[1] ?? DEFAULT_TOKEN).trim();
}

function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const result = spawnSync('curl', ['-sf', `${BASE}/api/auth/me`], { stdio: 'ignore' });
    if (result.status === 0) return;
    spawnSync('sleep', ['1']);
  }
  throw new Error(`開発サーバーが応答しません: ${BASE}`);
}

const token = ensureDevVars();
const playwrightArgs = process.env.GITHUB_ACTIONS === 'true' ? ['install', '--with-deps', 'chromium'] : ['install', 'chromium'];
run(bin('playwright'), playwrightArgs);
run(bin('wrangler'), ['d1', 'migrations', 'apply', 'memo', '--local']);
run('npm', ['run', 'db:reset:local']);
run('npm', ['run', 'build']);

const logFd = openSync(LOG, 'w');
const server = spawn(bin('wrangler'), ['dev', '--port', PORT], {
  cwd: ROOT,
  detached: true,
  stdio: ['ignore', logFd, logFd],
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});

function stopServer() {
  if (!server.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // すでに終了している
  }
}

try {
  waitForServer();
  run(process.execPath, ['e2e/smoke.mjs'], {
    ...process.env,
    BASE_URL: BASE,
    SETUP_TOKEN: token,
  });
  console.log('スクリーンショット: e2e/screenshots/');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  try {
    console.error(readFileSync(LOG, 'utf8').slice(-4000));
  } catch {
    // ログが無い
  }
  stopServer();
  process.exit(1);
}
stopServer();
