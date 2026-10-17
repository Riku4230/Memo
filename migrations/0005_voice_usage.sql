-- 音声入力の使用回数（1人1日の上限を守るため。Gemini の料金が膨らまないように）。毎日の後片付けで古い日の分を消す
CREATE TABLE voice_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,            -- 日本時間の日付（YYYY-MM-DD）
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
