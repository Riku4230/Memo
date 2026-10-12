# 欲しいものメモ 要件定義書

- 版数: v0.1（たたき台）
- 作成日: 2026-10-12
- ステータス: 方針案。§10 の「要確認」が決まったら v0.2 で確定する
- 前提: [Kakeibo](https://github.com/Riku4230/kakeibo)（2人の家計簿）と同じデザイン・技術構成・運用のしかたにそろえる

---

## 1. 目的・スコープ

### 1.1 目的
「これ欲しい」「今度あそこで買う」と思ったその場で、アプリを開いてすぐ書き留められるようにする。
あとで「どこで買うか」「どんなものか」で探して見返し、調べた内容やリンクも一緒に残せるようにする。

### 1.2 主要機能（スコープ内）
| # | 機能 | 概要 |
|---|------|------|
| F1 | すぐ登録 | 開いた画面の入力欄に名前を書くだけで登録できる。カテゴリは任意 |
| F2 | 一覧 | すべてのメモを新しい順に一覧。カテゴリ・キーワードで絞り込み |
| F3 | 詳細・編集 | 1件ごとのページで、名前・カテゴリ・詳細メモ・リンクを見る／直す／消す |
| F4 | カテゴリ（2段） | 大カテゴリ「どこで買う」（例: 家電量販店）と、その中の中カテゴリ「ジャンル」（例: 洗濯機）を自由に追加・並べ替え・削除 |
| F5 | リンク | 調べたページの URL を1件に複数つけられる。押すと別タブで開く |
| F6 | おる | Kakeibo のキャラクター「おる」が、アプリを開いたときなどにときどき出てきてひとことしゃべる |

### 1.3 スコープ外（初期リリースでは対応しない）
- 価格・予算の管理、家計簿への連携（買ったら家計簿に記録、など）
- 画像の添付（R2 を使わない構成にする。必要になったら Kakeibo の受け取り処理を流用して追加）
- リンク先のタイトル・画像の自動取得（OGP）。§9 フェーズ2の候補
- 共有シート（他のアプリから「共有」でメモに送る）。iPhone の PWA は Web Share Target に対応していないため
- 通知（Web Push）

---

## 2. 想定ユーザー・利用環境

- 利用者: Kakeibo と同じ。管理者（最初にセットアップした1名）と、招待したメンバー（想定は2人）
- 端末: 主に iPhone（ホーム画面に追加した PWA）。PC のブラウザでも使う
- 提供形態: Web アプリ（PWA）。Kakeibo とは別のアプリ・別の URL・別のホーム画面アイコン

### 2.1 PWA・レスポンシブ
Kakeibo の §2.1・§2.2 と同じ決まりにする。

| 画面幅 | レイアウト |
|--------|------------|
| 〜767px（スマホ） | 1カラム。一覧 → 押すと詳細ページへ移る。入力欄は画面下（親指が届く位置）に固定 |
| 768〜1023px | 1カラム。一覧の幅を広げる |
| 1024px〜（PC） | 2カラム。左に一覧、右に選んだメモの詳細を常に表示。入力欄は一覧の上 |

- `display: standalone`、`viewport-fit=cover` と `env(safe-area-inset-*)`、入力欄は 16px 以上（自動ズーム防止）
- 画面の明るさ（自動・ライト・ダーク）は端末ごとに切り替え（Kakeibo の `public/theme.js` と同じ仕組み）

---

## 3. 用語

| 用語 | 定義 |
|------|------|
| メモ | 欲しいもの1件の記録。名前・カテゴリ・詳細メモ・リンクを持つ |
| 名前 | メモの見出し（例: ドラム式洗濯機）。必須 |
| 詳細メモ | 名前だけでは足りない内容（候補の型番、サイズ、気になる点など）を書く自由記述欄 |
| 大カテゴリ | どこで買うか（例: 家電量販店、無印良品、Amazon、ドラッグストア） |
| 中カテゴリ | 大カテゴリの中のジャンル（例: 家電量販店 › 洗濯機 / 冷蔵庫） |
| リンク | 調べたページの URL と、任意の表示名 |

---

## 4. 機能要件

### F1. すぐ登録（いちばん大事な機能）

- アプリを開いた最初の画面（一覧）に、常に入力欄を出す。名前を書いて「追加」（Enter）で登録できる
- カテゴリは入力欄の横のボタンから選ぶ（任意）。選ばなければ「未分類」
  - 直前に選んだカテゴリを覚えておき、次の入力でも選んだ状態にする（端末ごと）。✕で外せる
  - 一覧をカテゴリで絞り込んでいるときは、そのカテゴリを初めから選んだ状態にする
- 登録したら入力欄を空にして入力を続けられる状態にし、一覧のいちばん上に追加する（画面の読み直しなし）
- 詳細メモ・リンクは登録後に詳細ページで足す。入力欄の「詳しく書く」から、名前・カテゴリ・詳細メモ・リンクをまとめて書くシートも開ける
- 開いたときのキーボード: PC は入力欄に自動でカーソルを置く。iPhone は Safari の制約で、利用者が押すまでキーボードを出せない（§11 リスク）。そのため入力欄は大きく、画面下の押しやすい位置に置く
- 電波がないときは端末に保存して、つながったら送る（Kakeibo の `lib/offline.ts` を流用）。お店の中など電波の弱い場所で使うため。フェーズ2で対応（§9）

### F2. 一覧

- すべてのメモを、作成日時の新しい順に表示する
- 1行に出すもの: 名前、カテゴリ（「家電量販店 › 洗濯機」）、詳細メモの1行目（あれば）、リンクの件数（あれば）
- 絞り込み
  - 大カテゴリのチップ（横スクロール）。選ぶと、その中の中カテゴリのチップが出る
  - キーワード（名前・詳細メモ・リンクの表示名から探す）
- 大カテゴリごとにまとめて見る表示（見出しつき）にも切り替えられる。初期は新しい順
- 行を押すと詳細ページ（F3）へ。PC は右側に表示

### F3. 詳細・編集

- URL を持つ個別のページにする（`/m/<メモID>`）。ブラウザの戻る・PC での直接アクセスに対応
- 表示・編集する項目: 名前、大カテゴリ・中カテゴリ、詳細メモ（複数行・改行そのまま表示）、リンク
- 編集はその場で直して「保存」。保存せずに離れようとしたら確認する
- 削除は確認してから。削除したあと数秒「元に戻す」を出す（Kakeibo の Toast）
- 作成者・作成日時・更新日時を小さく表示（共有しているときは「〇〇が追加」）

### F4. カテゴリ（2段）

Kakeibo の「カテゴリ › 中カテゴリ」と同じ作り。

- 大カテゴリ: 名前・アイコン（Kakeibo の `CATEGORY_ICON_KEYS` から選ぶ）・色。追加・名前変更・並べ替え（ドラッグ、キーボードは↑↓）・削除
- 中カテゴリ: 大カテゴリごとに持つ。追加・名前変更・並べ替え・削除。中カテゴリは任意（大カテゴリだけでもよい）
- 同じ名前の中カテゴリを別の大カテゴリに作れる（「家電量販店 › 洗濯機」と「Amazon › 洗濯機」）
- 入力・編集画面のカテゴリ選択からも、その場で新しい大カテゴリ・中カテゴリを追加できる
- 削除するとき、使っているメモがあれば「未分類にする」か「ほかのカテゴリに移す」を選ぶ。大カテゴリを消すと中にある中カテゴリも消える
- 初期カテゴリ（初回セットアップで作る。あとで自由に変更）: 家電量販店（洗濯機・冷蔵庫・掃除機）、ホームセンター、ドラッグストア、スーパー、無印良品、IKEA、ネット通販、その他

### F5. リンク

- 1件のメモにリンクを最大10件。URL（必須）と表示名（任意。空なら URL のドメインを表示）
- 貼り付けた文字列から URL を取り出す（共有で付く前後の文章を除く）。`http://` `https://` 以外は受け付けない（`javascript:` などを防ぐ）
- 押すと別タブで開く（`rel="noopener noreferrer"`）。並べ替え・削除ができる

### F6. おる（定期的に出てくる）

Kakeibo の「おる」（`components/Oru.tsx`・`OruCameo.tsx`・`lib/oru.ts`・`public/mascot/oru-sheet.webp`）をそのまま使い、しゃべる内容だけメモ向けにする。

- 出てくるとき: アプリを開いたとき・ほかのアプリから戻ってきたときに2回に1回くらい。前に出てから5分はあける（Kakeibo と同じ `ORU_CHANCE = 0.5`・`ORU_GAP_MS = 5分`）
- 画面の右下（スマホは入力欄の少し上）から歩いてきて、ひとことしゃべって帰る。押すとすぐ帰る。吹き出しはしゃべり終わって3秒で消える
- 入力中・シートを開いている間は出さない（すぐ登録の邪魔をしない）
- メモを追加したときに、ときどき（5回に1回くらい・5分あける決まりは同じ）ジャンプして「メモしたよ！」などと言う
- しゃべる内容
  - 普通のひとこと（例: 「欲しいもの、思いついた？」「メモしておけば忘れないよ」「ゆっくりえらぼうね〜」）
  - 時間帯のひとこと（Kakeibo の `timeLines` を流用し、文面をメモ向けに変える）
  - メモの数字のひとこと（例: 「家電量販店のメモが3件あるよ。今度まとめて見に行こう」「1か月前のメモ、まだ欲しい？」）
- 設定の「表示」で端末ごとにオフにできる。「視差効果を減らす」の端末では動かさない
- 端末に保存するキーは Kakeibo と分ける（`memo:oru` など。同じ URL ではないので実際には衝突しないが、名前で区別する）

---

## 5. 画面一覧

| 画面 | URL | 内容 |
|------|-----|------|
| 一覧（ホーム） | `/` | すぐ登録の入力欄・絞り込み・メモの一覧。PC は右に詳細 |
| 詳細 | `/m/:id` | 1件の表示・編集・削除 |
| 詳しく書く（シート） | — | 名前・カテゴリ・詳細メモ・リンクをまとめて入力して登録 |
| カテゴリ選択（シート） | — | 大カテゴリ → 中カテゴリの順に選ぶ。その場で追加も可 |
| 設定 | `/settings` | カテゴリの管理、表示（明るさ・おる）、パスキー、メンバー招待、データの書き出し、ログアウト |
| ログイン・セットアップ・招待 | `/` の中で切り替え | Kakeibo の `AuthScreens.tsx` と同じ |

- 画面の切り替えは History API で行い、ルーター用のライブラリは入れない（画面が少ないため。Kakeibo も入れていない）
- スマホの下部タブは置かない（画面が2つしかないため）。一覧の右上に設定ボタン

---

## 6. データ要件

### 6.1 テーブル（D1）

認証まわり（`users` / `credentials` / `sessions` / `auth_challenges` / `recovery_codes` / `invites`）は Kakeibo の `migrations/0001_init.sql`・`0002_invites.sql` 以降の該当部分をまとめて1本にして持ってくる。

```sql
-- メモ帳（共有の単位）。初期は1つだけ作り、全員が使う（§10 要確認 1）
CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- users に space_id を持たせる（Kakeibo の users.book_id と同じ考え方）

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (space_id, name)
);

CREATE TABLE subcategories (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (category_id, name)
);

CREATE TABLE memos (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                 -- 名前（1〜100文字）
  body TEXT NOT NULL DEFAULT '',       -- 詳細メモ（〜5,000文字）
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),  -- §10 要確認 2
  client_id TEXT,                      -- 電波がないときの再送で二重登録しないための端末側 ID
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  done_at TEXT,
  UNIQUE (space_id, client_id)
);
CREATE INDEX idx_memos_space_created ON memos(space_id, created_at DESC);
CREATE INDEX idx_memos_space_category ON memos(space_id, category_id, subcategory_id);

CREATE TABLE memo_links (
  id TEXT PRIMARY KEY,
  memo_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,                   -- http/https のみ、〜2,048文字
  label TEXT NOT NULL DEFAULT '',      -- 〜100文字
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_memo_links_memo ON memo_links(memo_id);
```

- 中カテゴリは大カテゴリに属する。メモの `subcategory_id` は `category_id` の中のものだけ受け付ける（サーバーで確認）
- ID はサーバーで発行する乱数（Kakeibo と同じ）。日時は ISO 8601（UTC）で保存し、画面で日本時間に直す

### 6.2 API（Hono、`/api/*`）

| メソッド・パス | 内容 |
|------|------|
| `GET /api/memos?category=&sub=&q=&status=&cursor=` | 一覧（50件ずつ。リンクの件数つき） |
| `POST /api/memos` | 登録（名前だけでも可。リンクを一緒に送ってもよい） |
| `GET /api/memos/:id` | 詳細（リンクつき） |
| `PATCH /api/memos/:id` | 編集（リンクは全件送って置き換え） |
| `DELETE /api/memos/:id` | 削除 |
| `GET/POST/PATCH/DELETE /api/categories`・`/api/subcategories` | カテゴリの管理・並べ替え |
| `GET /api/export` | 全メモを CSV（または JSON）で書き出し |
| `/api/auth/*`・`/api/admin/*` | Kakeibo と同じ（ログイン・パスキー・招待・メンバー） |

- 入力チェックは zod のスキーマを `src/shared/schemas.ts` に置き、画面と API で同じものを使う（Kakeibo と同じ）

---

## 7. 非機能要件

| 項目 | 内容 |
|------|------|
| 速さ | 開いてから入力欄が使えるまで、2回目以降は 1 秒以内（Service Worker で画面をキャッシュ）。登録は画面に先に反映し、裏で送る |
| 対応ブラウザ | iPhone の Safari（ホーム画面アプリ）、PC の Chrome / Safari / Edge の最新版 |
| アクセシビリティ | 文字と背景のコントラスト 4.5:1 以上（Kakeibo のトークンを使えば満たす）、キーボードだけで操作できる |
| 費用 | Cloudflare の無料枠の中（Workers 10万リクエスト/日、D1 5GB）。AI は使わないので費用は 0 円の想定 |
| データ保護 | D1 の Time Travel（無料プランは7日前まで戻せる）＋設定からの書き出し。Kakeibo のような週次バックアップ（R2）はフェーズ2で検討 |

---

## 8. 技術構成

Kakeibo と同じ構成にする。違いは「R2・AI・Web Push・Cron の大半を使わない」ことだけ。

| 層 | 技術 |
|----|------|
| 画面 | React 19 + TypeScript + Vite（PWA）、Tailwind CSS v4、lucide-react、LINE Seed JP（同梱フォント）、clsx |
| API | Cloudflare Workers + Hono（画面ファイルの配信も同じ Worker。`assets.run_worker_first: ["/api/*"]`） |
| DB | Cloudflare D1（SQLite） |
| 認証 | パスキー（@simplewebauthn）＋リカバリーコード、招待制（Kakeibo の実装を移植） |
| 入力チェック | zod（画面と API で共有） |
| Cron | 毎日1回、期限切れのセッション・認証チャレンジ・招待を消す |
| テスト | vitest（単体）＋ @cloudflare/vitest-pool-workers（D1 込みの結合テスト）＋ Playwright（E2E・画面幅ごとの見た目） |
| CI / 公開 | GitHub Actions。Kakeibo の `ci.yml`・`deploy.yml` を流用（main の CI が通ったら `wrangler deploy`） |

### 8.1 デザインの統一のしかた

Kakeibo から次をコピーして持ってくる。見た目の決まりは Kakeibo の `styles.css` の先頭コメントのとおり（白地・細い線で区切る・影とグラデーションは浮くものだけ・色はオレンジ1色）。

| 持ってくるもの | Kakeibo の場所 |
|------|------|
| 色・文字サイズ・アニメーションのトークン（ライト/ダーク） | `src/client/styles.css` |
| 画面の明るさの切り替え | `public/theme.js`・`src/client/lib/theme.ts` |
| シート（下から出る・払って閉じる）・トースト | `components/Sheet.tsx`・`components/Toast.tsx` |
| カテゴリのアイコン・選択・編集・中カテゴリ | `shared/icons.ts`・`components/CategoryIcon.tsx`・`CategoryPicker.tsx`・`SubcategoryPicker.tsx`・`CategoryEditor.tsx`・`SubcategoryManager.tsx`・`views/CategoryManager.tsx` |
| おる | `components/Oru.tsx`・`OruCameo.tsx`・`lib/oru.ts`・`public/mascot/oru-sheet.webp` |
| ログイン・パスキー・招待 | `views/AuthScreens.tsx`・`worker/routes/auth.ts`・`worker/lib/session.ts`・`worker/lib/crypto.ts`・`worker/lib/http.ts` |
| 端末内の保存・更新の検知・振動 | `lib/storage.ts`・`lib/update.ts`・`lib/haptics.ts`・`public/sw.js`・`public/_headers` |

- 共通パッケージ（モノレポや npm パッケージ）にはしない。アプリが2つ・作るのが1人なので、まとめる手間の方が大きい。コピーしたファイルの先頭に「Kakeibo の〇〇から」と書き、Kakeibo 側で直したら合わせる
- アプリが3つ目になる、またはコピー元との差が目立ってきたら、共通部分を別パッケージにまとめることを検討する
- ホーム画面で見分けられるよう、アイコンは別の絵にする（色の系統は同じ）

### 8.2 ディレクトリ構成

```
src/client     画面（React）。views/ 画面、components/ 共通部品、lib/ 保存・テーマ・おる
src/worker     API（Hono）。routes/（auth / memos / categories / admin）、lib/（セッション・暗号・HTTP）
src/shared     画面と API で共有する型・入力チェック・日付
migrations     D1 のテーブル定義（0001 認証、0002 メモとカテゴリ）
public         manifest / Service Worker / アイコン / おるの画像 / _headers
test/worker    Workers 結合テスト
e2e            ブラウザでの動作確認
```

### 8.3 Kakeibo に組み込む案を採らない理由
Kakeibo の中に「メモ」タブを足せば認証やデザインを共有できるが、次の理由で別アプリにする。
- 「開いてすぐ書ける」ことが目的なので、メモだけの画面で起動したい（Kakeibo はカレンダーで起動する）
- Kakeibo は機能が多く、変更のたびに確かめる範囲が広い。メモの変更で家計簿を壊す心配をなくしたい
- 代わりに、ログインは別々になる（パスキーをもう1つ登録する）

---

## 9. リリース計画

| フェーズ | 内容 |
|------|------|
| 1（最初の公開） | 認証・招待、すぐ登録、一覧と絞り込み、詳細・編集・削除、2段カテゴリ、リンク、おる、PWA、書き出し、CI と自動公開 |
| 2 | 電波がないときの記録、リンク先のタイトル・画像の自動取得（OGP。Worker でリンク先を取りに行く）、週次バックアップ |
| 3（必要なら） | 画像の添付（R2）、買ったら Kakeibo に記録する連携、iPhone のショートカットからの登録 |

---

## 10. 要確認（決めてほしいこと）

| # | 項目 | このたたき台での仮の決定 | ほかの選択肢 |
|---|------|------|------|
| 1 | 2人で共有するか | 全員で1つのメモ帳を共有（Kakeibo の共有の家計簿と同じ） | 1人1冊・共有と個人用の両方 |
| 2 | 「買った」の印 | 付ける。チェックすると一覧の下の「買ったもの」に移り、元に戻せる | 付けない（買ったら消す） |
| 3 | カテゴリの関係 | 2段（大カテゴリ「どこで買う」の中に中カテゴリ「ジャンル」） | 2軸を別々に選ぶ（「家電量販店」と「洗濯機」を独立に選び、それぞれで絞り込める）。同じジャンルを複数のお店で買える場合はこちらの方が重複がない |
| 4 | ログイン | Kakeibo とは別にパスキーを登録 | Cloudflare Access（コードは不要だが、iPhone のホーム画面アプリでログインが切れやすい） |
| 5 | アクセントの色 | Kakeibo と同じオレンジ | アプリごとに1色だけ変える（トークン `--c-brand*` だけ差し替え） |
| 6 | 公開先の URL | `memo.<Kakeibo と同じドメイン>` または `memo.<アカウント>.workers.dev` | — |

---

## 11. リスク・懸念

| リスク | 内容 | 対応 |
|------|------|------|
| iPhone でキーボードが自動で出ない | iOS の Safari・ホーム画面アプリは、利用者が押す前に入力欄へカーソルを置いてもキーボードを出さない。「開いたらすぐ打てる」はタップ1回が必要 | 入力欄を画面下の大きな的にする。どうしても0タップにしたい場合はフェーズ3の iPhone のショートカット連携で補う |
| デザインのずれ | コピーした部品が Kakeibo と少しずつずれていく | コピー元を各ファイルの先頭に書く。差が大きくなったら共通化（§8.1） |
| リンクの安全 | 利用者が貼った URL を画面に出す | `http`/`https` だけ受け付け、`noopener noreferrer` で開く。CSP は Kakeibo の `_headers` を流用。OGP 取得を入れるときは、取りに行く先を `http`/`https` の公開アドレスに限り、サイズと時間の上限を付ける |
| ログインが2つになる | Kakeibo とメモでパスキーを別々に登録する | 初回の登録だけの手間。気になる場合は §10-4 |
| おるの出すぎ | メモは短時間に何度も開くため、出てくる回数が Kakeibo より多くなりうる | 5分あける決まりを守る。多すぎれば確率を下げる |
