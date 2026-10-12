import { describe, expect, it } from 'vitest';
import { inAppBrowser, passkeyErrorMessage } from './passkey';

describe('パスキーの案内', () => {
  it('アプリの中のブラウザを見分ける', () => {
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0')).toBe('LINE');
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0')).toBe('Instagram');
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBeNull();
  });

  it('エラーの種類ごとに直し方を出す', () => {
    expect(passkeyErrorMessage('NotAllowedError')).toContain('自動入力とパスワード');
    expect(passkeyErrorMessage('NotAllowedError')).toContain('アドレス欄に貼り付けて');
    expect(passkeyErrorMessage('InvalidStateError')).toContain('パスキーでログイン');
  });
});
