// 本番とプレビューの公開。ワークフローは DEPLOY_TARGET を渡すだけで、資源の名前はここでは扱う。
// プレビューは設定の Worker 名に -preview を付けた別 Worker へ出し、database_id も別のものに差し替える。
// 差し替えは公開のあいだだけで、終わったらファイルを元に戻す。
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertSafeDatabase,
  pickDeployUrl,
  planDeploy,
  readDatabaseId,
  readDatabaseName,
  readWorkerName,
  resolveDatabaseSource,
  runWithConfig,
  workerDeployArgs,
} from './deploy-plan.mjs';

const configPath = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url));
const resultPath = fileURLToPath(new URL('../deploy-result.txt', import.meta.url));
const wranglerPath = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url));
const HEALTH_PATH = '/api/auth/me';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(args) {
  const result = spawnSync(wranglerPath, args, {
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`wrangler ${args.join(' ')} が失敗しました`);
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function sleep(seconds) {
  spawnSync('sleep', [String(seconds)]);
}

function healthcheck(origin) {
  const target = `${origin}${HEALTH_PATH}`;
  let code = '';
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = spawnSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', target], { encoding: 'utf8' });
    code = (result.stdout ?? '').trim();
    if (code === '200') return;
    if (attempt < 5) sleep(3);
  }
  throw new Error(`公開先が応答しません: ${target} (${code || 'no response'})`);
}

const plan = planDeploy(process.env);
if (!plan.ok) fail(plan.error);
if (plan.action === 'skip') {
  console.log(plan.reason);
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::warning::${plan.reason}`);
  process.exit(0);
}

const source = readFileSync(configPath, 'utf8');
const worker = readWorkerName(source);
const database = readDatabaseName(source);
if (!worker.ok) fail(worker.error);
if (!database.ok) fail(database.error);

const resolved = resolveDatabaseSource(source, plan);
if (!resolved.ok) fail(resolved.error);
const safe = assertSafeDatabase(plan.action, resolved.databaseId, plan.productionDatabaseId);
if (!safe.ok) fail(safe.error);

const args = workerDeployArgs(worker.name, plan.action);
if (!args.ok) fail(args.error);
if (plan.action === 'production' && args.args.includes('--name')) fail('本番の公開コマンドに Worker 名の上書きがあります');

console.log(`${plan.action} で database_id=${resolved.databaseId} を使います`);
let output = '';
try {
  runWithConfig(configPath, resolved.source, () => {
    const written = readDatabaseId(readFileSync(configPath, 'utf8'));
    if (!written.ok || written.databaseId.toLowerCase() !== resolved.databaseId.toLowerCase()) {
      throw new Error('設定ファイルの database_id が期待と違います');
    }
    run(['d1', 'migrations', 'apply', database.name, '--remote']);
    output = run(args.args);
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const picked = pickDeployUrl(output, worker.name, plan.action);
if (!picked.ok) fail(picked.error);
try {
  healthcheck(picked.url);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const label = plan.action === 'preview' ? 'preview' : 'production';
writeFileSync(resultPath, `### ${label}\n\n${picked.url}\n`);
console.log(`${label === 'preview' ? 'PREVIEW_URL' : 'DEPLOY_URL'}=${picked.url}`);
