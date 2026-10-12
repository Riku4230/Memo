-- 認証まわり（Kakeibo の 0001〜0005・0011 のうち、使うものをまとめた形）
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL
);

CREATE TABLE credentials (
  id TEXT PRIMARY KEY,               -- WebAuthn credential ID (base64url)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,          -- base64url
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,                   -- JSON 配列
  device_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX idx_credentials_user ON credentials(user_id);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,          -- セッションIDの SHA-256。生のIDは保存しない
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  auth_at TEXT,                      -- 最後にパスキーで本人確認した時刻（重要な操作の前に確かめる）
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('setup', 'add', 'login', 'invite', 'reauth')),
  user_id TEXT,
  invite_id TEXT,
  ip TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_auth_challenges_ip ON auth_challenges(ip, expires_at);

CREATE TABLE recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  used_at TEXT
);

CREATE TABLE auth_failures (
  ip TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX idx_auth_failures_ip ON auth_failures(ip, at);

CREATE TABLE auth_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,   -- 招待リンクのトークンの SHA-256。生のトークンは保存しない
  note TEXT NOT NULL DEFAULT '',     -- 誰に送ったかのメモ
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TEXT
);

-- メモ帳は全員で1つを共有する。メモ・購入先・ジャンルに持ち主の列はない

-- 購入先（どこで買うか）
CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ジャンル（どういうものか）。購入先とは独立
CREATE TABLE genres (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE memos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,                 -- 名前（1〜100文字）
  body TEXT NOT NULL DEFAULT '',       -- 詳細メモ（〜5,000文字）
  genre_id TEXT REFERENCES genres(id) ON DELETE SET NULL,
  done_at TEXT,                        -- 買った日時。NULL なら「欲しい」
  done_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  client_id TEXT UNIQUE,               -- 送り直したときに二重登録しないための、端末で作る ID
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,            -- 内容（名前・ジャンル・候補・メモ・リンク）を変えた時刻。同時に直したことに気づく目印にも使う
  deleted_at TEXT                      -- 消した時刻。「元に戻す」のため7日間は残し、毎日の後片付けで消す
);
CREATE INDEX idx_memos_created ON memos(created_at DESC);
CREATE INDEX idx_memos_genre ON memos(genre_id);

-- 候補（メモ × 購入先）。1件のメモに購入先を複数、同じ購入先は1回だけ
CREATE TABLE memo_offers (
  id TEXT PRIMARY KEY,
  memo_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price INTEGER CHECK (price IS NULL OR price BETWEEN 0 AND 9999999),  -- 円
  url TEXT NOT NULL DEFAULT '',        -- http/https のみ
  note TEXT NOT NULL DEFAULT '',       -- ひとこと（〜200文字）
  checked_on TEXT,                     -- 値段を確かめた日（YYYY-MM-DD、日本時間）
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (memo_id, store_id)
);
CREATE INDEX idx_memo_offers_store ON memo_offers(store_id);

-- 購入先に関係しないリンク（レビュー記事など）
CREATE TABLE memo_links (
  id TEXT PRIMARY KEY,
  memo_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,                   -- http/https のみ、〜2,048文字
  label TEXT NOT NULL DEFAULT '',      -- 〜100文字
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_memo_links_memo ON memo_links(memo_id);
