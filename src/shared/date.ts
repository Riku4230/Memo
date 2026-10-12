/** 日付は "YYYY-MM-DD" の文字列で扱う。タイムゾーンのずれを避けるため Date はUTCで計算する */

/** 日本時間の今日（サーバー・クライアント共通） */
export function todayJst(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/** ISO 8601 の日時を、日本時間の日付にする */
export function dateJst(iso: string): string {
  return todayJst(new Date(iso));
}

/** a から b まで何日か（b が後なら正） */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
