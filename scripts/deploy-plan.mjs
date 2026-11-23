// 公開前の判断。ネットワークも設定ファイルの書き換えもここではしない。
import { readFileSync, writeFileSync } from 'node:fs';

export const PLACEHOLDER_DATABASE_ID = '00000000-0000-0000-0000-000000000000';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 貼り付けで入った空白と改行を除く */
export function stripSpace(value) {
  return String(value ?? '').replace(/\s/g, '');
}

export function isUuid(value) {
  return UUID.test(value) && value.toLowerCase() !== PLACEHOLDER_DATABASE_ID;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ ok: true, action: 'skip', reason: string } | { ok: true, action: 'production', databaseId: string | null } | { ok: true, action: 'preview', databaseId: string, productionDatabaseId: string } | { ok: false, error: string }}
 */
export function planDeploy(env) {
  const target = stripSpace(env.DEPLOY_TARGET || 'production') || 'production';
  const token = stripSpace(env.CLOUDFLARE_API_TOKEN);
  const account = stripSpace(env.CLOUDFLARE_ACCOUNT_ID);
  const prodId = stripSpace(env.D1_DATABASE_ID);
  const previewId = stripSpace(env.D1_PREVIEW_DATABASE_ID);
  const event = env.GITHUB_EVENT_NAME || '';
  const inCi = env.GITHUB_ACTIONS === 'true';
  const headRef = env.GITHUB_HEAD_REF || '';

  if (target !== 'production' && target !== 'preview') {
    return { ok: false, error: 'DEPLOY_TARGET は production または preview です' };
  }
  if ((event === 'pull_request' || headRef) && target !== 'preview') {
    return { ok: false, error: 'プルリクエストから本番へはデプロイしません' };
  }
  if (inCi && (!token || !account)) {
    return { ok: true, action: 'skip', reason: 'CLOUDFLARE_API_TOKEN または CLOUDFLARE_ACCOUNT_ID が未設定のためスキップします' };
  }
  if (target === 'preview') {
    if (!previewId) {
      return { ok: true, action: 'skip', reason: 'D1_PREVIEW_DATABASE_ID が未設定のためプレビューをスキップします' };
    }
    if (!isUuid(previewId)) {
      return { ok: false, error: 'D1_PREVIEW_DATABASE_ID が UUID ではありません' };
    }
    if (!prodId || !isUuid(prodId)) {
      return { ok: false, error: 'D1_DATABASE_ID が無いと、プレビューが本番と同じデータベースでないことを確認できません' };
    }
    if (previewId.toLowerCase() === prodId.toLowerCase()) {
      return { ok: false, error: 'D1_PREVIEW_DATABASE_ID が本番の D1_DATABASE_ID と同じです' };
    }
    return { ok: true, action: 'preview', databaseId: previewId, productionDatabaseId: prodId };
  }
  if (inCi && event !== 'workflow_run' && event !== 'workflow_dispatch') {
    return { ok: false, error: '本番デプロイは CI 成功後の workflow_run か手動実行だけです' };
  }
  if (prodId) {
    if (!isUuid(prodId)) return { ok: false, error: 'D1_DATABASE_ID が UUID ではありません' };
    return { ok: true, action: 'production', databaseId: prodId };
  }
  if (inCi) return { ok: false, error: 'D1_DATABASE_ID が未設定です' };
  return { ok: true, action: 'production', databaseId: null };
}

export function readJsonString(source, key) {
  const matches = [...source.matchAll(new RegExp(`"${key}":\\s*"([^"]*)"`, 'g'))];
  if (matches.length !== 1) {
    return { ok: false, error: `${key} は設定ファイルに 1 つだけ必要です` };
  }
  return { ok: true, value: matches[0][1] };
}

export function readDatabaseId(source) {
  const found = readJsonString(source, 'database_id');
  if (!found.ok) return found;
  return { ok: true, databaseId: found.value };
}

export function readWorkerName(source) {
  const found = readJsonString(source, 'name');
  if (!found.ok) return found;
  return { ok: true, name: found.value };
}

export function readDatabaseName(source) {
  const found = readJsonString(source, 'database_name');
  if (!found.ok) return found;
  return { ok: true, name: found.value };
}

export function applyDatabaseId(source, databaseId) {
  if (!isUuid(databaseId)) return { ok: false, error: '書き込む database_id が UUID ではありません' };
  const current = readDatabaseId(source);
  if (!current.ok) return current;
  if (current.databaseId.toLowerCase() === databaseId.toLowerCase()) {
    return { ok: true, source, databaseId };
  }
  if (current.databaseId.toLowerCase() !== PLACEHOLDER_DATABASE_ID) {
    return { ok: false, error: 'database_id がプレースホルダではないため書き換えません' };
  }
  const marker = `"database_id": "${PLACEHOLDER_DATABASE_ID}"`;
  if (source.split(marker).length !== 2) {
    return { ok: false, error: 'プレースホルダの database_id を 1 つに特定できません' };
  }
  const next = source.replace(marker, `"database_id": "${databaseId}"`);
  if (next.includes(PLACEHOLDER_DATABASE_ID)) {
    return { ok: false, error: 'プレースホルダが残っています' };
  }
  return { ok: true, source: next, databaseId };
}

/** 本番で環境変数が無いときは、ファイルに既にある ID を使う（ローカルの公開）。プレビューはプレースホルダからの差し替えだけ。 */
export function resolveDatabaseSource(source, plan) {
  if (plan.action === 'preview') return applyDatabaseId(source, plan.databaseId);
  if (plan.databaseId) return applyDatabaseId(source, plan.databaseId);
  const current = readDatabaseId(source);
  if (!current.ok) return current;
  if (!isUuid(current.databaseId)) {
    return { ok: false, error: '本番の database_id が未設定です。D1_DATABASE_ID を設定してください' };
  }
  return { ok: true, source, databaseId: current.databaseId };
}

export function assertSafeDatabase(action, databaseId, productionDatabaseId) {
  if (!isUuid(databaseId)) return { ok: false, error: '使用する database_id が UUID ではありません' };
  if (action === 'preview') {
    if (!isUuid(productionDatabaseId)) {
      return { ok: false, error: '本番の database_id が無く、プレビューを止めました' };
    }
    if (databaseId.toLowerCase() === productionDatabaseId.toLowerCase()) {
      return { ok: false, error: 'プレビューが本番のデータベースを指しています' };
    }
  }
  return { ok: true };
}

export function workerDeployArgs(workerName, action) {
  if (!workerName || workerName.includes('-preview')) {
    return { ok: false, error: 'Worker 名が不正です' };
  }
  if (action === 'production') return { ok: true, args: ['deploy'] };
  if (action === 'preview') return { ok: true, args: ['deploy', '--name', `${workerName}-preview`] };
  return { ok: false, error: 'action が不正です' };
}

export function pickDeployUrl(output, workerName, action) {
  const matches = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/gi) ?? [];
  const want = action === 'preview' ? `${workerName}-preview` : workerName;
  const hits = matches.filter((url) => url.slice('https://'.length).split('.')[0] === want);
  if (hits.length === 0) return { ok: false, error: 'workers.dev の URL が出力にありません' };
  return { ok: true, url: hits[0] };
}

/** fn のあと、ファイルを呼び出す前の内容に戻す。fn が失敗しても戻す。 */
export function runWithConfig(file, nextSource, fn) {
  const original = readFileSync(file, 'utf8');
  const changed = original !== nextSource;
  if (changed) writeFileSync(file, nextSource);
  try {
    return fn();
  } finally {
    if (changed) writeFileSync(file, original);
  }
}
