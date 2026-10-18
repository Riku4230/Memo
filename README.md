# 2人のメモ

「これ欲しい」と思ったその場で書き留める、2人で使うメモの Web アプリ（PWA）。
「100均 › ダイソー」のような大カテゴリ・中カテゴリで分けて見られ、詳細メモや調べたページのリンクも残せる。
普段の買い物（スーパーで牛乳、100均で収納ケースなど）も、カテゴリで絞り込めばそのまま買い物リストになる。
[2人の家計簿（Kakeibo）](https://github.com/Riku4230/kakeibo) と同じデザイン・技術構成で、Cloudflare の無料枠で動く。

- 要件・仕様: [docs/requirements.md](docs/requirements.md)

## 主な機能

| 機能 | 内容 |
|------|------|
| すぐ登録 | 開いた画面の入力欄に名前を書いて「追加」。カテゴリは任意で、登録したら選び直し |
| 音声入力 | 「追加」の横のマイクで話すと、Gemini が名前・値段・カテゴリ・詳細メモの下書きを作る。確認画面でまとめて直して登録 |
| 一覧 | 欲しいもの。新しい順・カテゴリごと（大カテゴリ › 中カテゴリ）。大カテゴリ・中カテゴリ（同じ名前はまとめる）・キーワードで絞り込み。買ったものは横へ流れて消え、左上の丸で買ったものの履歴（日ごと・もう一度）、詳細に買った日を出す |
| 詳細 | `/m/:id` の個別ページ。名前・値段・カテゴリ・詳細メモ・リンク。PC は一覧の右に出す |
| 買ったチェック | 一覧と詳細のチェックボックス。押すとすぐ一覧から外れる。元に戻せる |
| カテゴリ | 大カテゴリ（名前・色・アイコン）と中カテゴリを自由に追加・並べ替え・削除（家計簿のカテゴリ管理と同じ作り） |
| おる | Kakeibo のキャラクター。開いたとき・戻ってきたときにときどき出てきてひとことしゃべる（設定でオフ） |
| 共有 | 招待制の2人で1つのメモ帳。パスキー（Face ID など）だけのログイン |
| 書き出し | すべてのメモを CSV で（1件で1行） |
| 家計簿との連携 | 2人の家計簿でレシート・手入力を登録したとき、まだ買っていないものと照らし合わせ、おるが「買った？」と聞く。「買った」にしたものに、ここの「買った」チェックが付く（`src/worker/bridge.ts` の `KakeiboBridge`。サービスバインディングだけで呼べ、URL は持たない） |

## 構成

| 層 | 技術 |
|----|------|
| 画面 | React + TypeScript + Vite（PWA）、Tailwind CSS v4、lucide-react、LINE Seed JP（同梱フォント） |
| API | Cloudflare Workers + Hono（Cron Trigger で毎日の後片付け） |
| DB | Cloudflare D1（SQLite） |
| 認証 | パスキー（WebAuthn）＋リカバリーコード。新規登録は初回セットアップと招待リンクのみ（Kakeibo から移植） |

```
src/client     画面（React）。views/ に各画面、components/ に共通部品、lib/ に一覧の組み立て・おる・表示の設定
src/worker     API（Hono）
  routes/      エンドポイント（auth / memos / categories（大カテゴリ・中カテゴリ）/ export / admin）
  services/    毎日の後片付け
  lib/         セッション・暗号・HTTP
src/shared     画面と API で共有する型・入力チェック・URL
migrations     D1 のテーブル定義
public         manifest / Service Worker / アイコン / おるの画像 / セキュリティヘッダー（_headers）
design         アイコンの元画像（icon-original.png はいただいた画像、icon-source.png は角丸を外した 1024px 四方）
test/worker    Workers 結合テスト（本番と同じランタイム、D1 込み）
e2e            ブラウザでの動作確認（スマホ・PC・ダーク・320px・おる）
```

Kakeibo から持ってきたもの（色・文字のトークン、シート、トースト、おる、ログイン・招待）は、ファイルの先頭のコメントに「Kakeibo の〇〇から」と書いてある。Kakeibo 側で直したら合わせる。

アイコンを差し替えるときは `design/icon-source.png`（1024px 四方・角丸なし）を置き換えて `npm run icons`。iPhone は同じ URL のアイコンを覚えているので、`index.html` と `manifest.webmanifest` のアイコンの `?v=` の数字も1つ上げる。

## ローカルで動かす

```bash
npm ci
cp .dev.vars.example .dev.vars        # SETUP_TOKEN= の右を任意の文字列に変更（= の前後に空白を入れない）
npm run db:migrate:local
npm run build
npx wrangler dev                      # http://localhost:8787
```

画面を編集しながら確認する場合は、`npx wrangler dev` を起動したまま別のターミナルで `npm run dev`（http://localhost:5173）。
このとき `.dev.vars` に `APP_ORIGIN=http://localhost:8787` を追加する（パスキーの検証先を API 側に合わせるため）。

初回アクセスでセットアップ画面が出るので、`SETUP_TOKEN` に設定した値と表示名を入力してパスキーを登録する。
表示されるリカバリーコード（10個）は必ず控えておく。2人目は、設定の「招待リンクを作成」で作ったリンクから登録する。

### テスト

```bash
npm run typecheck
npm run build
npm test                              # 単体テスト（Node）＋ Workers 結合テスト（D1 込みで API を呼ぶ）
npx wrangler dev                      # 別ターミナルで起動しておく（.dev.vars の SETUP_TOKEN は local-dev-setup-token-1234567890）
npm run e2e                           # ブラウザでの一連の操作確認（ローカルDBを空にしてから実行する。画面は e2e/screenshots/ に残る）
```

Playwright 同梱のブラウザがない環境では `CHROMIUM_PATH=/path/to/chrome npm run e2e` で実行ファイルを指定する。

## Cloudflare へのデプロイ

公開先は `https://memo.rk0o0y.workers.dev`（Kakeibo と同じアカウントの workers.dev）。

### 最初の1回（自分のパソコンから）

```bash
npx wrangler login                                   # ブラウザで Cloudflare にログイン（初回だけ）
export MEMO_SETUP_TOKEN='推測できない20文字以上の文字列'   # 最初の登録画面で入力する合言葉（Kakeibo とは別の値にする）
./scripts/deploy-first-time.sh   # D1 作成 → マイグレーション → 公開 → SETUP_TOKEN の登録。再実行しても安全
```

音声入力を使うには、Gemini の API キーを登録する（Kakeibo と同じキーでよい。未設定の間はお試し版（固定のサンプル）で動く）。

```bash
npx wrangler secret put GEMINI_API_KEY   # キーは Google AI Studio（https://aistudio.google.com/apikey）で確認・コピーできる
```

モデルは既定で `gemini-3.5-flash-lite`（Kakeibo と同じ）。変える場合は `wrangler.jsonc` の `vars` に `GEMINI_MODEL` を足す。

スクリプトは作った D1 の ID を `wrangler.jsonc` に書き込む。このファイルはコミットしない（リポジトリは 0 のままにしておく）。

### 2回目以降（GitHub から自動で公開）

main に push して CI（型チェック・テスト・E2E）が通ると、`.github/workflows/deploy.yml` が本番に公開する。
GitHub のリポジトリ設定（Settings → Secrets and variables → Actions）に次を登録しておく。

| 種類 | 名前 | 中身 |
|------|------|------|
| Secrets | `CLOUDFLARE_API_TOKEN` | Workers Scripts と D1 を編集できる API トークン（Kakeibo と同じものを使ってよい） |
| Secrets | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |
| Variables | `D1_DATABASE_ID` | 最初のデプロイで作った D1 の ID（スクリプトが表示する） |

## うまくいかないとき

- **招待リンクから登録しようとすると「QRコードまたはセキュリティキー」しか出ない**：LINE から開いた（「ブラウザで開く」を使った場合も含む）ときに起きる。リンクを長押しでコピーし、Safari のアドレス欄に貼り付けて開き直すと登録できる。Safari で直接開いても同じなら、iPhone の 設定 → 一般 →「自動入力とパスワード」で「パスワード」（Apple のもの）にチェックが入っているか、設定 → 自分の名前 → iCloud →「パスワード」がオンかを確かめる
- 招待リンクは登録が終わるまで使用済みにならないので、開き直しても同じリンクを使える（作ってから7日間）

## 運用メモ

- 消したメモは7日間サーバーに残り（「元に戻す」用）、毎日 3:23（日本時間）の後片付けで消える
- データを戻したいときは D1 の Time Travel（無料プランは7日前まで）。`npx wrangler d1 time-travel restore memo --timestamp=...`
- 依存パッケージの脆弱性は `npm audit` で確認する
