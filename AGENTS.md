最初に [docs/harness/common.md](docs/harness/common.md) を読むこと。以下はこのリポジトリ（2人のメモ）だけの決まり。

## アプリ

2人で使う買い物メモの PWA。欲しいものをその場で書き、大カテゴリ › 中カテゴリで見て、買ったものは一覧から外す。ログインはパスキーだけ。データは2人の個人的なメモで、本番の D1 に入っている。

要件は [docs/requirements.md](docs/requirements.md)。画面の説明とローカルの起動手順は [README.md](README.md)。

## 技術と Cloudflare

Workers に React（Vite）の静的ファイルと Hono の API を載せる。Pages の Git 連携は使っていない。KV と R2 は無い。

| 資源 | 値 |
| --- | --- |
| Worker | `memo`（`https://memo.rk0o0y.workers.dev`） |
| 静的ファイル | `wrangler.jsonc` の `assets.directory` = `./dist`。`/api/*` だけ Worker が先に受ける |
| D1 | バインディング `DB`、名前 `memo`。`database_id` はリポジトリでは `00000000-0000-0000-0000-000000000000`。本番の ID は GitHub の Variables `D1_DATABASE_ID` |
| プレビュー | Worker `memo-preview`。D1 は Variables `D1_PREVIEW_DATABASE_ID`（本番とは別。未設定ならプレビューはスキップ） |
| Cron | `23 18 * * *`（日本時間 3:23 に、消してから7日たったメモなどを削除） |
| Worker シークレット | `SETUP_TOKEN`（初回登録）、`GEMINI_API_KEY`（任意。無い間は音声入力が固定のサンプル） |
| 家計簿からの呼び出し | クラス `KakeiboBridge`。URL は無く、サービスバインディングの RPC だけ。名前を変えない |

公開は GitHub Actions が `npm run deploy` を呼ぶ。中身は `scripts/deploy.mjs`。本番は main への push で CI が成功したあと。プルリクエストは `memo-preview` だけ。シークレットが無いときはワークフローを失敗にせずスキップする。

## ディレクトリ

```
src/client     画面（views/ components/ lib/）
src/worker     API（routes/ services/ lib/）。入口は index.ts、家計簿向けは bridge.ts
src/shared     画面と API で共有する型・zod・URL
migrations     D1。適用済みのファイルは書き換えない。足すときは、公開前に当たっても前の版のアプリが動く形
public         manifest、Service Worker、アイコン、_headers
test/worker    Workers の結合テスト（D1 込み）
e2e            ブラウザ確認。smoke.mjs が CI の主要画面。run.mjs は手元の通し確認
scripts        初回公開、アイコン、deploy.mjs
```

Kakeibo から写したファイルは先頭コメントに出典がある。残す。

## コマンド

```bash
npm ci
cp .dev.vars.example .dev.vars   # SETUP_TOKEN を入れる。コミットしない
npm run db:migrate:local
npm run dev:api                  # http://localhost:8787
npm run dev                      # 画面だけ http://localhost:5173。API は別ターミナル
npm run typecheck
npm run lint
npm test                         # ビルドしてから vitest（単体と Workers 結合）
npm run test:e2e                 # ローカル D1 を空にし、開発サーバーを起動して主要画面を撮る。CI もこれを使う
npm run build
npm run e2e                      # 手元の通し確認。先に wrangler dev。CI には入っていない
```

`npm run deploy` は本番（手元では、ファイルに実 ID が入っているとき、その D1 へマイグレーションしてから `wrangler deploy`）。エージェントは実行しない。

## 書き方

TypeScript は strict。未使用の変数と引数は型チェックが落とす。入力チェックは `src/shared/schemas.ts` の zod を画面と API で共有する。コメントと画面の文言は日本語。新しい依存は、チケットに必要だと書いてあるときだけ足す。

## 頼まれずに触らないもの

共通ルールに加え、このリポジトリでは次もエージェントが勝手に実行しない。

- `npm run db:migrate:remote`、`wrangler d1 execute memo --remote`、`wrangler d1 time-travel restore`
- `npm run deploy`、Actions の Deploy の手動実行、`scripts/deploy-first-time.sh`
- `wrangler.jsonc` の `database_id` を実 ID に変えてコミットすること
- `.dev.vars`、`SETUP_TOKEN`、`GEMINI_API_KEY`、GitHub の Secrets の値
- 本番のメモを CSV などで取り出してリポジトリや PR に置くこと
- `KakeiboBridge` のクラス名、Worker 名 `memo`、公開 URL
- プレビューを本番の D1 に繋ぐこと。`D1_PREVIEW_DATABASE_ID` と `D1_DATABASE_ID` を同じ値にしない

## つまずきやすい点

- Workers の結合テストは `dist` の静的ファイルを読む。`npm test` は先に `npm run build` する。
- `.github/workflows/ci.yml` と `deploy.yml` は、共有ハーネスとして他のリポジトリと同じ内容にする。このアプリの既定ブランチは `main`。ワークフローには `master` も書いてある（もう一方のリポジトリが `master` のため）。アプリの差は `package.json` の script と `scripts/deploy.mjs` に置く。
- `deploy.yml` の `workflow_run` は、既定ブランチに入っているファイルが使われる。マージするまで本番の公開手順は変わらない。
- プルリクエストの CI では本番へ出ない。本番は `workflow_run` の `event == push` かつブランチが `main` か `master` のときだけ。
- 公開スクリプトは `database_id` を差し替えてマイグレーションと deploy を行い、終わったらプレースホルダへ戻す。失敗しても戻す。戻す前のファイルに実 ID が入っていたローカルの設定は、プレースホルダではないので上書きしない。
- マイグレーションは公開より先に当たる。前の版の Worker でも動く変更にする。
- `SETUP_TOKEN` は GitHub Secrets ではない。デプロイはこれを上書きしない。プレビュー Worker にもコピーしない。プレビューでログインを試すときだけ、オーナーが `memo-preview` に自分で入れる。
- 音声入力の録音は保存しない。`GEMINI_API_KEY` が無いプレビューは固定のサンプルを返す。
- アイコンを替えたら `npm run icons` のあと、`index.html` と `manifest.webmanifest` の `?v=` を 1 つ上げる。
- 画面を変えたチケットは `npm run test:e2e` が CI で走る。ローカル D1 の中身は空になる。通し確認は手元の `npm run e2e`（別途 `wrangler dev` が必要）。
- `npm run test:e2e` が撮る画面（スマホ幅 390。PC は幅 1280）: セットアップ（`01-setup`）、空の一覧（`02-home-empty`）、メモのある一覧（`03-home`）、PC の一覧と詳細（`04-home-desktop`）、詳細（`05-detail`）、買ったもの（`06-bought`）、設定（`07-settings`）。音声入力、カテゴリ編集、ダーク、320px は撮らない。そこを変えたときは `npm run e2e` と PR 本文の画像で補う。
- シークレットは貼り付けの末尾の改行を除いてから使う。
- `typescript` という依存は TypeScript 6 の API（`@typescript/typescript6`）を指す。`tsc` コマンドは `@typescript/native`（TypeScript 7）のまま。typescript-eslint は TypeScript 7 の API を読めない。どちらの別名も外さない。`npm run typecheck` は TypeScript 7 のまま。

## オーナーが一度だけ行うこと

GitHub の Settings → Secrets and variables → Actions。

| 種類 | 名前 | 内容 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | 下の権限の API トークン。家計簿と同じものでよい |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |
| Variable | `D1_DATABASE_ID` | 本番 D1 `memo` の UUID。`scripts/deploy-first-time.sh` が表示する |
| Variable | `D1_PREVIEW_DATABASE_ID` | 任意。本番とは別の D1 の UUID。未設定なら PR のプレビューはスキップされ、成功扱い |

トークンはカスタムトークンで、このアカウントだけにする。GitHub Actions の IP では制限しない。

- Account → Workers Scripts → Edit（Worker `memo` の更新と、初回の `memo-preview` の作成）
- Account → D1 → Edit（`migrations apply`。バインディングを付けてデプロイするだけなら不要だが、公開のたびにマイグレーションするため必要）
- Account → Account Settings → Read（Wrangler がアカウントを解決する）

新しい Workers の権限モデルで、トークンが既存の `memo` だけの Editor だと `memo-preview` を作れない。そのときは Workers 製品スコープの Admin を足す。KV、R2、ゾーンの Workers Routes は不要（独自ドメインが無い）。

プレビュー用 D1 はダッシュボードか `npx wrangler d1 create memo-preview` で空のデータベースを作る。本番のデータをコピーしない。ID を `D1_PREVIEW_DATABASE_ID` に入れる。

ラベル `bug` はある。`feature` と `harness` が無ければ作る。Issue テンプレートがこの名前を付ける。

`SETUP_TOKEN` と `GEMINI_API_KEY` はこれまで通り Worker のシークレット。GitHub には置かない。
