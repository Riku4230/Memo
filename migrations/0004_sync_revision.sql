-- 2人で同時に使っているときに相手の変更を取り込むための「変わった番号」。
-- メモ・リンク・大カテゴリ・中カテゴリが変わるたびに 1 ずつ上げる（画面はこの番号だけを聞いて、変わっていたら読み直す）
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL
);
INSERT INTO sync_state (id, revision) VALUES (1, 0);

CREATE TRIGGER sync_memos_insert AFTER INSERT ON memos BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_memos_update AFTER UPDATE ON memos BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_memos_delete AFTER DELETE ON memos BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_links_insert AFTER INSERT ON memo_links BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_links_update AFTER UPDATE ON memo_links BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_links_delete AFTER DELETE ON memo_links BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_categories_insert AFTER INSERT ON categories BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_categories_update AFTER UPDATE ON categories BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_categories_delete AFTER DELETE ON categories BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_subcategories_insert AFTER INSERT ON subcategories BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_subcategories_update AFTER UPDATE ON subcategories BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
CREATE TRIGGER sync_subcategories_delete AFTER DELETE ON subcategories BEGIN UPDATE sync_state SET revision = revision + 1 WHERE id = 1; END;
