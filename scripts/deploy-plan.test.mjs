import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_DATABASE_ID,
  applyDatabaseId,
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

const PROD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PREVIEW = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function ci(env) {
  return { GITHUB_ACTIONS: 'true', ...env };
}

describe('公開の判断', () => {
  it('CI でシークレットが無いときはスキップする', () => {
    const plan = planDeploy(ci({ GITHUB_EVENT_NAME: 'workflow_run', DEPLOY_TARGET: 'production' }));
    expect(plan).toMatchObject({ ok: true, action: 'skip' });
  });

  it('プルリクエストから本番へは出さない', () => {
    const plan = planDeploy(ci({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_HEAD_REF: 'feature',
      DEPLOY_TARGET: 'production',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      D1_DATABASE_ID: PROD,
    }));
    expect(plan.ok).toBe(false);
  });

  it('プレビュー用の ID が無いプルリクエストはスキップする', () => {
    const plan = planDeploy(ci({
      GITHUB_EVENT_NAME: 'pull_request',
      DEPLOY_TARGET: 'preview',
      CLOUDFLARE_API_TOKEN: ' token \n',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      D1_DATABASE_ID: PROD,
    }));
    expect(plan).toMatchObject({ ok: true, action: 'skip' });
  });

  it('プレビューは本番と別のデータベースだけを許す', () => {
    const ok = planDeploy(ci({
      GITHUB_EVENT_NAME: 'pull_request',
      DEPLOY_TARGET: 'preview',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      D1_DATABASE_ID: PROD,
      D1_PREVIEW_DATABASE_ID: PREVIEW,
    }));
    expect(ok).toMatchObject({ ok: true, action: 'preview', databaseId: PREVIEW, productionDatabaseId: PROD });

    const same = planDeploy(ci({
      GITHUB_EVENT_NAME: 'pull_request',
      DEPLOY_TARGET: 'preview',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      D1_DATABASE_ID: PROD,
      D1_PREVIEW_DATABASE_ID: PROD.toUpperCase(),
    }));
    expect(same.ok).toBe(false);
  });

  it('本番の ID を知らないプレビューは止める', () => {
    const plan = planDeploy(ci({
      GITHUB_EVENT_NAME: 'pull_request',
      DEPLOY_TARGET: 'preview',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      D1_PREVIEW_DATABASE_ID: PREVIEW,
    }));
    expect(plan.ok).toBe(false);
  });

  it('CI の本番は workflow_run か手動実行で、UUID があるときだけ', () => {
    expect(planDeploy(ci({
      GITHUB_EVENT_NAME: 'workflow_run',
      DEPLOY_TARGET: 'production',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      D1_DATABASE_ID: ` ${PROD}\n`,
    }))).toMatchObject({ ok: true, action: 'production', databaseId: PROD });

    expect(planDeploy(ci({
      GITHUB_EVENT_NAME: 'push',
      DEPLOY_TARGET: 'production',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      D1_DATABASE_ID: PROD,
    })).ok).toBe(false);

    expect(planDeploy(ci({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      DEPLOY_TARGET: 'production',
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      D1_DATABASE_ID: PLACEHOLDER_DATABASE_ID,
    })).ok).toBe(false);
  });
});

describe('設定ファイルの database_id', () => {
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

  it('リポジトリの設定はプレースホルダのまま', () => {
    expect(readDatabaseId(config).databaseId).toBe(PLACEHOLDER_DATABASE_ID);
    expect(readWorkerName(config).name).toBe('memo');
    expect(readDatabaseName(config).name).toBe('memo');
  });

  it('プレースホルダだけを差し替え、本番 ID が入ったファイルは触らない', () => {
    const applied = applyDatabaseId(config, PREVIEW);
    expect(applied.ok).toBe(true);
    expect(applied.source).toContain(PREVIEW);
    expect(applied.source).not.toContain(PLACEHOLDER_DATABASE_ID);
    const dirty = config.replace(PLACEHOLDER_DATABASE_ID, PROD);
    expect(applyDatabaseId(dirty, PREVIEW).ok).toBe(false);
  });

  it('プレビューの解決結果は本番 ID を拒否する', () => {
    const resolved = resolveDatabaseSource(config, { action: 'preview', databaseId: PREVIEW });
    expect(assertSafeDatabase('preview', resolved.databaseId, PROD).ok).toBe(true);
    expect(assertSafeDatabase('preview', PROD, PROD).ok).toBe(false);
  });
});

describe('公開コマンドと URL', () => {
  it('本番は Worker 名を上書きせず、プレビューは別の名前にする', () => {
    expect(workerDeployArgs('memo', 'production').args).toEqual(['deploy']);
    expect(workerDeployArgs('memo', 'preview').args).toEqual(['deploy', '--name', 'memo-preview']);
    expect(workerDeployArgs('memo-preview', 'production').ok).toBe(false);
  });

  it('URL は Worker 名の先頭ラベルで区別する', () => {
    const output = [
      'Deployed memo triggers',
      '  https://memo.example.workers.dev',
      '  https://memo-preview.example.workers.dev',
    ].join('\n');
    expect(pickDeployUrl(output, 'memo', 'production').url).toBe('https://memo.example.workers.dev');
    expect(pickDeployUrl(output, 'memo', 'preview').url).toBe('https://memo-preview.example.workers.dev');
  });
});

describe('設定ファイルを元に戻す', () => {
  it('処理が失敗しても database_id を戻す', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-plan-'));
    const file = join(dir, 'wrangler.jsonc');
    const original = `"database_id": "${PLACEHOLDER_DATABASE_ID}"`;
    writeFileSync(file, original);
    const next = original.replace(PLACEHOLDER_DATABASE_ID, PREVIEW);
    expect(() => runWithConfig(file, next, () => {
      expect(readFileSync(file, 'utf8')).toBe(next);
      throw new Error('boom');
    })).toThrow('boom');
    expect(readFileSync(file, 'utf8')).toBe(original);
    rmSync(dir, { recursive: true });
  });
});
