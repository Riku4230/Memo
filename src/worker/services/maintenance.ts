import type { Env } from '../env';

const DAY = 24 * 60 * 60 * 1000;
/** 消したメモを「元に戻す」で戻せる日数 */
export const RESTORE_DAYS = 7;

/**
 * 毎日の後片付け（Cron Trigger から呼ぶ）。
 * - 消してから7日たったメモ（候補・リンクも外部キーで消える）
 * - 期限切れのセッション・チャレンジ
 * - 古い失敗記録（1日）と認証ログ（180日）
 */
export async function runMaintenance(env: Env, now = new Date()): Promise<{ memos: number }> {
  const iso = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM memos WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(iso(RESTORE_DAYS * DAY)),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now.toISOString()),
    env.DB.prepare('DELETE FROM auth_challenges WHERE expires_at < ?').bind(now.toISOString()),
    env.DB.prepare('DELETE FROM auth_failures WHERE at < ?').bind(iso(DAY)),
    env.DB.prepare('DELETE FROM auth_logs WHERE created_at < ?').bind(iso(180 * DAY)),
  ]);
  return { memos: res[0]!.meta.changes ?? 0 };
}
