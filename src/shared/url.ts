/** リンクとして受け付ける URL の長さの上限 */
export const MAX_URL_LENGTH = 2048;

/** http / https の URL だけを受け付ける（javascript: などを画面に出さない） */
export function isHttpUrl(s: string): boolean {
  if (s.length > MAX_URL_LENGTH) return false;
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * 貼り付けた文字列から URL を取り出す。共有で付く前後の文章（「〇〇をチェック！ https://…」など）を除く。
 * 見つからなければ、入力をそのまま返す（入力チェックで断る）
 */
export function extractUrl(input: string): string {
  const s = input.trim();
  const m = s.match(/https?:\/\/[^\s<>"'「」（）()、。]+/i);
  if (!m) return s;
  // 文の終わりに付いた記号は URL に含めない
  return m[0].replace(/[.,!?！？]+$/, '');
}

/** 表示名がないときに出す、URL のドメイン（www. は省く） */
export function urlDomain(s: string): string {
  try {
    return new URL(s).hostname.replace(/^www\./, '');
  } catch {
    return s;
  }
}
