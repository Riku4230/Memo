export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** 初回セットアップ（最初のパスキー登録）でのみ使うトークン。Workers Secret に設定する */
  SETUP_TOKEN?: string;
  /** パスキーの検証に使うオリジン。未設定ならリクエストURLのオリジンを使う */
  APP_ORIGIN?: string;
  RP_NAME: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { userId: string; sessionHash: string };
};
