-- メモに値段（円・任意）を足す。v0.6 で購入先ごとの値段（memo_offers）をやめたときに、値段の入力まで消してしまったので戻す。
-- 前に購入先ごとに入れた値段は memo_offers に残っているので、いちばん安い値段をメモの値段にする
ALTER TABLE memos ADD COLUMN price INTEGER CHECK (price IS NULL OR (price >= 0 AND price <= 9999999));
UPDATE memos SET price = (SELECT MIN(o.price) FROM memo_offers o WHERE o.memo_id = memos.id AND o.price IS NOT NULL);
