/**
 * パスキーを作れないときに、理由を画面で伝えるための判定。
 * iPhone では、作れない状態だと「QRコードまたはセキュリティキー」だけが出て、何が悪いのか分からないため、先に案内を出す
 */

/** アプリの中のブラウザ（LINE など）で開いているなら、そのアプリの名前。そこではパスキーを作れないことが多い */
export function inAppBrowser(ua: string): string | null {
  if (/\bLine\//i.test(ua)) return 'LINE';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/\bGSA\//.test(ua)) return 'Google アプリ';
  if (/Slack/i.test(ua)) return 'Slack';
  if (/\bX\/|Twitter/i.test(ua)) return 'X';
  return null;
}

const SETTINGS_HINT =
  '設定 → 一般 →「自動入力とパスワード」で「パスワード」（Apple のもの）にチェックが入っているか、設定 → 自分の名前 → iCloud →「パスワード」がオンかを確認してください';

/** この画面でパスキーを作れなさそうなら、その理由と直し方。作れそうなら null */
export async function passkeyProblem(): Promise<string | null> {
  const app = inAppBrowser(navigator.userAgent);
  if (app) return `${app}の中では登録できません。右下（または右上）の「…」から「Safari で開く」を選んでください`;
  if (typeof window.PublicKeyCredential === 'undefined') return 'このブラウザはパスキーに対応していません。Safari で開いてください';
  try {
    // Safari 17.4 以降・Chrome 133 以降は、端末にパスキーを保存できるかを直接教えてくれる
    const pkc = window.PublicKeyCredential as typeof PublicKeyCredential & { getClientCapabilities?: () => Promise<Record<string, boolean>> };
    if (pkc.getClientCapabilities) {
      const caps = await pkc.getClientCapabilities();
      if (caps.passkeyPlatformAuthenticator === false) return `この端末にパスキーを保存できない状態です。${SETTINGS_HINT}`;
    }
    if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
      return `この端末で Face ID などを使うパスキーを作れない状態です。${SETTINGS_HINT}`;
    }
  } catch {
    // 判定できなければ、案内は出さずにそのまま進める
  }
  return null;
}

/** パスキーの操作が失敗したときの、端末が返したエラーの種類ごとの説明 */
export function passkeyErrorMessage(name: string): string {
  switch (name) {
    case 'NotAllowedError':
      return `パスキーを作れませんでした（キャンセルしたか、この端末に保存できない状態です）。「QRコードまたはセキュリティキー」と出た場合は、${SETTINGS_HINT}`;
    case 'InvalidStateError':
      return 'この端末には、すでにこのアプリのパスキーがあります。ログイン画面の「パスキーでログイン」を使ってください';
    case 'NotSupportedError':
      return 'この端末・ブラウザはパスキーに対応していません。Safari で開いてください';
    case 'SecurityError':
      return 'このアドレスではパスキーを使えません。アプリのアドレス（memo.rk0o0y.workers.dev）を Safari で直接開いてください';
    default:
      return 'パスキーの操作に失敗しました。もう一度お試しください';
  }
}
