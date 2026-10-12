#!/usr/bin/env bash
# 最初のデプロイ：D1 の作成 → マイグレーション → 公開 → SETUP_TOKEN の登録
# Cloudflare へのログインは次のどちらか
#   - 自分のパソコン: 先に `npx wrangler login`（ブラウザでログイン）
#   - CI などブラウザがない環境: 環境変数 CLOUDFLARE_API_TOKEN（と CLOUDFLARE_ACCOUNT_ID）
# 必要な環境変数: MEMO_SETUP_TOKEN（最初の登録に使う、推測できない20文字以上の文字列）
# 何度実行しても、作成済みのものはそのまま使う
set -euo pipefail
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false

if [ -z "${MEMO_SETUP_TOKEN:-}" ]; then echo "環境変数 MEMO_SETUP_TOKEN が設定されていません" >&2; exit 1; fi
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && ! npx wrangler whoami 2>/dev/null | grep -qi "logged in"; then
  echo "Cloudflare にログインしていません。先に npx wrangler login を実行してください" >&2
  exit 1
fi
if [ "${#MEMO_SETUP_TOKEN}" -lt 20 ]; then echo "MEMO_SETUP_TOKEN は20文字以上にしてください" >&2; exit 1; fi

echo "== D1 データベース"
DB_ID=$(npx wrangler d1 list --json | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));const d=l.find(x=>x.name==="memo");process.stdout.write(d?d.uuid:"")')
if [ -z "$DB_ID" ]; then
  # 設定ファイルは下でこのスクリプトが書き換えるので、wrangler には触らせない（対話の質問も出さない）
  npx wrangler d1 create memo --update-config=false >/dev/null
  DB_ID=$(npx wrangler d1 list --json | node -e 'const l=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(l.find(x=>x.name==="memo").uuid)')
  echo "作成しました: $DB_ID"
else
  echo "作成済み: $DB_ID"
fi
node -e '
const fs=require("fs");const p="wrangler.jsonc";const s=fs.readFileSync(p,"utf8");
fs.writeFileSync(p,s.replace(/"database_id": "[^"]*"/,`"database_id": "${process.argv[1]}"`));
' "$DB_ID"
echo "GitHub の自動公開を使うときは、この ID をリポジトリの Variables の D1_DATABASE_ID に登録してください: $DB_ID"

echo "== マイグレーション"
npx wrangler d1 migrations apply memo --remote

echo "== ビルドと公開"
npm run build
npx wrangler deploy

echo "== SETUP_TOKEN の登録"
printf '%s' "$MEMO_SETUP_TOKEN" | npx wrangler secret put SETUP_TOKEN >/dev/null
echo "登録しました"

echo "完了"
