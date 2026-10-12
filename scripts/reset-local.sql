-- ローカル開発用 DB のデータを空にする（E2E を実行する前に使う）
DELETE FROM memo_links;
DELETE FROM memo_offers;
UPDATE memos SET category_id = NULL, subcategory_id = NULL;
DELETE FROM memos;
DELETE FROM stores;
DELETE FROM genres;
DELETE FROM subcategories;
DELETE FROM categories;
DELETE FROM invites;
DELETE FROM sessions;
DELETE FROM credentials;
DELETE FROM recovery_codes;
DELETE FROM users;
DELETE FROM auth_failures;
DELETE FROM auth_challenges;
DELETE FROM auth_logs;
