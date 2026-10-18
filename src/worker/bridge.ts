import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Env } from './env';
import { nowIso } from './lib/http';

/** 家計簿に渡す「まだ買っていないもの」1件 */
export interface BridgeWant {
  id: string;
  title: string;
  /** 大カテゴリ・中カテゴリの名前（店名で絞り込むのに使う。「100均 › ダイソー」など） */
  category: string | null;
  subcategory: string | null;
}

/** 一度に渡す・まとめて買ったにする件数の上限 */
const MAX = 300;

/**
 * 2人の家計簿（Kakeibo）から呼ぶ窓口。Cloudflare のサービスバインディング（RPC）だけで使い、URL は持たない（インターネットからは呼べない）。
 * 家計簿でレシートや手入力を登録したときに、買いたいものの中に買ったものがないか照らし合わせ、
 * 「買った？」と聞いて「買った」と答えたものに、このアプリの「買った」チェックを付ける
 */
export class KakeiboBridge extends WorkerEntrypoint<Env> {
  /** まだ買っていない（消していない）メモ。新しい順 */
  async wants(): Promise<BridgeWant[]> {
    const { results } = await this.env.DB.prepare(
      `SELECT m.id, m.title, c.name AS category, s.name AS subcategory
       FROM memos m LEFT JOIN categories c ON c.id = m.category_id LEFT JOIN subcategories s ON s.id = m.subcategory_id
       WHERE m.done_at IS NULL AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT ?`,
    )
      .bind(MAX)
      .all<BridgeWant>();
    return results;
  }

  /**
   * 「買った」チェックを付ける。もう付いているもの・消したものはそのまま。
   * 買った人は、家計簿の表示名と同じ名前の人がこのアプリにいればその人にする（いなければ空）。付けた件数を返す
   */
  async markBought(ids: string[], byName: string | null): Promise<number> {
    const list = [...new Set(ids.filter((id) => typeof id === 'string' && id.length <= 64))].slice(0, MAX);
    if (!list.length) return 0;
    const by = byName ? await this.env.DB.prepare('SELECT id FROM users WHERE name = ? LIMIT 1').bind(byName).first<{ id: string }>() : null;
    const now = nowIso();
    const res = await this.env.DB.batch(
      list.map((id) =>
        this.env.DB.prepare('UPDATE memos SET done_at = ?, done_by = ? WHERE id = ? AND done_at IS NULL AND deleted_at IS NULL RETURNING id').bind(now, by?.id ?? null, id),
      ),
    );
    // meta.changes には、同期の番号を上げるトリガーの分も入るので、更新した行を数える
    return res.reduce((n, r) => n + (r.results?.length ?? 0), 0);
  }
}
