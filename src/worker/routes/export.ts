import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { listMemos } from './memos';
import { listCategories } from './categories';

/** CSV の1項目。Excel で数式として読まれないよう、= + - @ で始まる文字には ' を付ける */
function cell(v: string | number | null): string {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 日本時間の「YYYY-MM-DD HH:MM」 */
function jst(iso: string | null): string {
  if (!iso) return '';
  return new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
}

export const exportCsv = new Hono<AppEnv>();

/** 全メモの書き出し（メモ1件で1行）。Excel で文字化けしないよう BOM を付ける */
exportCsv.get('/', async (c) => {
  const db = c.env.DB;
  const [memos, categoryList, users] = await Promise.all([listMemos(db), listCategories(db), db.prepare('SELECT id, name FROM users').all<{ id: string; name: string }>()]);
  const categoryName = new Map(categoryList.map((cat) => [cat.id, cat.name]));
  const subcategoryName = new Map(categoryList.flatMap((cat) => cat.subcategories.map((s) => [s.id, s.name] as const)));
  const userName = new Map(users.results.map((u) => [u.id, u.name]));
  const header = ['名前', '大カテゴリ', '中カテゴリ', '状態', '詳細メモ', 'リンク', '追加した人', '追加した日時', '買った日時'];
  const lines = [header.map(cell).join(',')];
  for (const m of memos) {
    lines.push(
      [
        m.title,
        m.categoryId ? (categoryName.get(m.categoryId) ?? '') : '',
        m.subcategoryId ? (subcategoryName.get(m.subcategoryId) ?? '') : '',
        m.doneAt ? '買った' : '欲しい',
        m.body,
        m.links.map((l) => (l.label ? `${l.label} ${l.url}` : l.url)).join('\n'),
        m.createdBy ? (userName.get(m.createdBy) ?? '') : '',
        jst(m.createdAt),
        jst(m.doneAt),
      ]
        .map(cell)
        .join(','),
    );
  }
  const stamp = jst(new Date().toISOString()).slice(0, 10);
  return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="memo-${stamp}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
});
