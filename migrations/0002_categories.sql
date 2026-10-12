-- 「購入先」「ジャンル」の2軸と購入先ごとの値段をやめ、家計簿と同じ「大カテゴリ › 中カテゴリ」にする。
-- 古い表（stores / genres / memo_offers）と memos.genre_id はそのまま残す（使わない。前に入れた値段などを消さないため）

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 中カテゴリ。大カテゴリごとに名前を付けるので、別の大カテゴリに同じ名前があってもよい
CREATE TABLE subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (category_id, name)
);
CREATE INDEX idx_subcategories_category ON subcategories(category_id);

-- メモの大カテゴリ・中カテゴリ（どちらも任意）。大カテゴリを消すとその中カテゴリも消え、メモからは外れる
ALTER TABLE memos ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE memos ADD COLUMN subcategory_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL;
CREATE INDEX idx_memos_category ON memos(category_id, subcategory_id);

-- すでに使っているメモ帳には、初期の大カテゴリ・中カテゴリを入れる（初回セットアップ前なら、セットアップのときに作る。src/worker/defaults.ts と同じ）
-- D1 は UNION ALL を多くつなげられないので、1行ずつ入れる
INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), '100均', 'shopping-bag', '#4a3aa7', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE EXISTS (SELECT 1 FROM users);
INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), '日用品', 'sparkles', '#1baf7a', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE EXISTS (SELECT 1 FROM users);
INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), '食品', 'utensils', '#eb6834', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE EXISTS (SELECT 1 FROM users);
INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), '家電', 'tv', '#2a78d6', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE EXISTS (SELECT 1 FROM users);
INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), '家具', 'sofa', '#8b5cf6', 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE EXISTS (SELECT 1 FROM users);
INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), '服', 'shirt', '#e87ba4', 5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE EXISTS (SELECT 1 FROM users);
INSERT INTO categories (id, name, icon, color, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), 'その他', 'package', '#8a8f98', 6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE EXISTS (SELECT 1 FROM users);
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'ダイソー', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '100均';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'セリア', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '100均';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'キャンドゥ', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '100均';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'ドラッグストア', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '日用品';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'スーパー', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '食品';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'ヨドバシ', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '家電';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'ビックカメラ', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '家電';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'Amazon', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '家電';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'ニトリ', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '家具';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, 'IKEA', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '家具';
INSERT INTO subcategories (id, category_id, name, sort_order, created_at, updated_at) SELECT lower(hex(randomblob(16))), id, '無印良品', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM categories WHERE name = '家具';

-- 今あるメモを移す。購入先の名前が中カテゴリと同じならその中カテゴリ（と大カテゴリ）へ、
-- 購入先・ジャンルの名前が大カテゴリと同じならその大カテゴリへ（例: 購入先「100均」→ 大カテゴリ「100均」）
UPDATE memos SET subcategory_id = (
  SELECT sc.id FROM memo_offers o JOIN stores s ON s.id = o.store_id JOIN subcategories sc ON sc.name = s.name
  WHERE o.memo_id = memos.id ORDER BY o.sort_order, sc.sort_order LIMIT 1
);
UPDATE memos SET category_id = (SELECT category_id FROM subcategories WHERE id = memos.subcategory_id) WHERE subcategory_id IS NOT NULL;
UPDATE memos SET category_id = (
  SELECT c.id FROM memo_offers o JOIN stores s ON s.id = o.store_id JOIN categories c ON c.name = s.name
  WHERE o.memo_id = memos.id ORDER BY o.sort_order LIMIT 1
) WHERE category_id IS NULL;
UPDATE memos SET category_id = (
  SELECT c.id FROM genres g JOIN categories c ON c.name = g.name WHERE g.id = memos.genre_id
) WHERE category_id IS NULL;
