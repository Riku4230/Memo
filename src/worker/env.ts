export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** 初回セットアップ（最初のパスキー登録）でのみ使うトークン。Workers Secret に設定する */
  SETUP_TOKEN?: string;
  /** パスキーの検証に使うオリジン。未設定ならリクエストURLのオリジンを使う */
  APP_ORIGIN?: string;
  RP_NAME: string;
  /** 音声入力に使う Gemini の API キー（Workers Secret）。未設定の間はお試し版（固定のサンプル結果）で動く */
  GEMINI_API_KEY?: string;
  /** 使う Gemini のモデル。未設定なら既定（Kakeibo と同じ） */
  GEMINI_MODEL?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { userId: string; sessionHash: string };
};
