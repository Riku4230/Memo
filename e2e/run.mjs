// ローカル（wrangler dev）に対する E2E 確認。パスキーは Chromium の仮想認証器で代用する。
// 使い方: npm run build && npx wrangler dev（別ターミナル） → npm run e2e（ローカルDBを空にしてから動かす）
// 画面は e2e/screenshots/ に保存する（スマホ・PC・ダーク・おる）
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const SETUP_TOKEN = process.env.SETUP_TOKEN ?? 'local-dev-setup-token-1234567890';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const consoleErrors = [];

async function newPage(viewport, opts = {}) {
  const context = await browser.newContext({ viewport, timezoneId: 'Asia/Tokyo', locale: 'ja-JP', ...opts });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  return { context, page };
}

async function addAuthenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
}

/** ローカル D1 に直接 SQL を実行する（画面からは見えない状態の確認用） */
function sql(command) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'memo', '--local', '--json', '--command', command], { encoding: 'utf8' });
  return JSON.parse(out)[0].results;
}

/** 条件が成り立つまで少し待つ（保存は画面の反映より後に終わるため） */
async function expectEventually(check, message, timeout = 5000) {
  const until = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > until) throw new Error(`待っても成り立たない: ${message}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function noHorizontalScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `${label}: 横にはみ出している（${over}px）`);
}

function step(name) {
  console.log(`- ${name}`);
}

// ---------- スマホ幅 ----------
const { context: mobileCtx, page } = await newPage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
// 失敗したときは、その時点の画面を残す
process.on('uncaughtException', async (e) => {
  console.error(e);
  await page.screenshot({ path: `${SHOTS}failure.png` }).catch(() => {});
  process.exit(1);
});
await addAuthenticator(page);

step('初回セットアップ（パスキー登録）');
await page.goto(BASE);
await page.getByLabel('セットアップ用トークン').fill(SETUP_TOKEN);
await page.getByLabel('表示名').fill('りく');
await page.getByRole('button', { name: 'パスキーを登録して始める' }).click();
await page.getByLabel('リカバリーコード').waitFor();
await page.getByLabel('コードを安全な場所に保存しました').check();
await page.getByRole('button', { name: '続ける' }).click();
await page.getByRole('heading', { name: '2人のメモ' }).waitFor();
await page.getByText('まだメモがありません').waitFor();
await page.screenshot({ path: `${SHOTS}mobile-empty.png` });
assert.equal(sql("SELECT COUNT(*) AS n FROM stores")[0].n, 10, '初期の購入先が作られている');

step('すぐ登録：名前だけで追加');
const input = page.getByLabel('欲しいもの', { exact: true });
await input.fill('ドラム式洗濯機');
await input.press('Enter');
await page.locator('.memo-row', { hasText: 'ドラム式洗濯機' }).waitFor();
assert.equal(await input.inputValue(), '', '追加したら入力欄が空になる');
await expectEventually(() => sql("SELECT COUNT(*) AS n FROM memos WHERE title = 'ドラム式洗濯機'")[0].n === 1, 'メモが保存される');

step('すぐ登録：ジャンルと購入先（複数）を選んで追加');
await page.locator('.quick-add').getByRole('button', { name: 'ジャンル' }).click();
await page.getByRole('dialog', { name: 'ジャンルを選ぶ' }).getByRole('button', { name: '洗濯機' }).click();
await page.locator('.quick-add').getByRole('button', { name: '購入先' }).click();
const storeSheet = page.getByRole('dialog', { name: '購入先を選ぶ' });
await storeSheet.getByRole('button', { name: 'ヨドバシ' }).click();
await storeSheet.getByRole('button', { name: 'Amazon' }).click();
await storeSheet.getByRole('button', { name: '決定' }).click();
await page.locator('.quick-add').getByRole('button', { name: 'ヨドバシ +1' }).waitFor();
await input.fill('洗濯機用ラック');
await page.locator('.quick-add').getByRole('button', { name: '追加' }).click();
await page.locator('.memo-row', { hasText: '洗濯機用ラック' }).getByText('洗濯機 ・ ヨドバシ ほか1件').waitFor();
await expectEventually(() => sql("SELECT COUNT(*) AS n FROM memo_offers o JOIN memos m ON m.id = o.memo_id WHERE m.title = '洗濯機用ラック'")[0].n === 2, '候補が2つ保存される');
// 選んだジャンル・購入先は次の入力でも選んだまま
await page.locator('.quick-add').getByRole('button', { name: '洗濯機' }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-list.png` });

step('詳細：購入先ごとの値段を足して比べる');
await page.locator('.memo-row', { hasText: 'ドラム式洗濯機' }).getByRole('button', { name: /ドラム式洗濯機/ }).click();
await page.getByRole('heading', { name: 'ドラム式洗濯機' }).waitFor();
for (const [store, price] of [
  ['ヨドバシ', '189800'],
  ['Amazon', '１７９，０００'],
]) {
  await page.getByRole('button', { name: '購入先を足す' }).click();
  await page.getByRole('dialog', { name: '購入先を足す' }).getByRole('button', { name: store }).click();
  const sheet = page.getByRole('dialog', { name: store });
  await sheet.getByLabel('値段', { exact: true }).fill(price);
  if (store === 'ヨドバシ') {
    await sheet.getByLabel('商品ページのリンク').fill('ここで見た https://www.yodobashi.com/product/100 送料無料');
    await sheet.getByLabel('ひとこと').fill('ポイント10%');
  }
  await sheet.getByRole('button', { name: '足す' }).click();
  await sheet.waitFor({ state: 'detached' });
}
const amazonRow = page.locator('.offer-row', { hasText: 'Amazon' });
await amazonRow.getByText('いちばん安い').waitFor();
await amazonRow.getByText('179,000円').waitFor();
await page.locator('.offer-row', { hasText: 'ヨドバシ' }).getByText('+10,800円').waitFor();
assert.equal(
  await page.getByRole('link', { name: 'ヨドバシの商品ページを開く' }).getAttribute('href'),
  'https://www.yodobashi.com/product/100',
  '貼り付けた文章から URL だけを取り出す',
);
assert.equal(await page.getByRole('link', { name: 'ヨドバシの商品ページを開く' }).getAttribute('rel'), 'noopener noreferrer');
// 安い順に並ぶ
const offerNames = await page.locator('.offer-row .font-medium').allTextContents();
assert.deepEqual(offerNames, ['Amazon', 'ヨドバシ'], '安い順に並ぶ');

step('詳細：直す（詳細メモ・リンク）');
await page.getByRole('button', { name: '直す' }).click();
const form = page.getByRole('dialog', { name: 'メモを直す' });
await form.getByLabel('詳細メモ').fill('幅60cmまで\n左開き');
await form.getByRole('button', { name: 'リンクを足す' }).click();
await form.getByLabel('リンク1の URL').fill('javascript:alert(1)');
await form.getByRole('button', { name: '保存する' }).click();
await form.getByText('http:// か https:// で始まる URL を入れてください').waitFor();
await form.getByLabel('リンク1の URL').fill('https://example.com/review');
await form.getByLabel('リンク1の表示名').fill('比較記事');
await form.getByRole('button', { name: '保存する' }).click();
await form.waitFor({ state: 'detached' });
await page.getByText('左開き').waitFor();
await page.getByRole('link', { name: /比較記事/ }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-detail.png`, fullPage: true });
await noHorizontalScroll(page, '詳細');

step('一覧に戻る：値段と並べ方');
await page.getByRole('button', { name: '一覧に戻る' }).click();
await page.locator('.memo-row', { hasText: 'ドラム式洗濯機' }).getByText('179,000円〜').waitFor();
await page.getByLabel('並べ方').selectOption('store');
const headings = await page.locator('.memo-section h2 span.flex-1').allTextContents();
assert.deepEqual(headings, ['ヨドバシ', 'Amazon'], '購入先ごとの見出し');
await page.locator('.memo-section', { hasText: 'ヨドバシ' }).locator('.memo-row', { hasText: 'ドラム式洗濯機' }).getByText('189,800円').waitFor();
await page.screenshot({ path: `${SHOTS}mobile-by-store.png`, fullPage: true });
await page.getByLabel('並べ方').selectOption('genre');
await page.locator('.memo-section h2', { hasText: '洗濯機' }).waitFor();
await page.getByLabel('並べ方').selectOption('recent');

step('絞り込みとさがす');
await page.getByLabel('購入先で絞り込む').selectOption({ label: 'Amazon' });
assert.equal(await page.locator('.memo-row').count(), 2);
await page.getByLabel('購入先で絞り込む').selectOption({ label: '購入先：すべて' });
await page.getByRole('button', { name: 'さがす' }).click();
await page.getByRole('searchbox', { name: 'さがす' }).fill('左開き');
assert.equal(await page.locator('.memo-row').count(), 1);
await page.getByRole('button', { name: 'さがす' }).click();
assert.equal(await page.locator('.memo-row').count(), 2);

step('買ったチェック・元に戻す');
await page.getByRole('checkbox', { name: '「洗濯機用ラック」を買った' }).click();
await page.locator('.memo-row', { hasText: '洗濯機用ラック' }).waitFor({ state: 'detached' });
await expectEventually(() => sql("SELECT done_at FROM memos WHERE title = '洗濯機用ラック'")[0].done_at !== null, '買ったが保存される');
await page.getByRole('button', { name: /買ったもの/ }).click();
await page.locator('.memo-row', { hasText: '洗濯機用ラック' }).waitFor();
await page.getByRole('checkbox', { name: '「洗濯機用ラック」を買った' }).click();
await expectEventually(() => sql("SELECT done_at FROM memos WHERE title = '洗濯機用ラック'")[0].done_at === null, '欲しいに戻る');
await page.getByRole('button', { name: /欲しい/ }).first().click();

step('消す・元に戻す');
await page.locator('.memo-row', { hasText: '洗濯機用ラック' }).getByRole('button', { name: /洗濯機用ラック/ }).click();
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'このメモを消す' }).click();
await page.getByRole('heading', { name: '2人のメモ' }).waitFor();
await page.getByRole('button', { name: '元に戻す' }).click();
await page.locator('.memo-row', { hasText: '洗濯機用ラック' }).waitFor();
await expectEventually(() => sql("SELECT deleted_at FROM memos WHERE title = '洗濯機用ラック'")[0].deleted_at === null, '元に戻る');

step('設定：購入先を足す・CSV');
await page.getByRole('button', { name: '設定' }).click();
await page.getByRole('heading', { name: '設定' }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-settings.png`, fullPage: true });
await page.getByRole('button', { name: /購入先・ジャンルの管理/ }).click();
const manager = page.getByRole('dialog', { name: '購入先・ジャンル' });
await manager.getByRole('button', { name: '購入先を追加' }).click();
await page.getByLabel('名前（20文字まで）').fill('コストコ');
await page.getByRole('button', { name: '追加する' }).click();
await manager.getByText('コストコ').waitFor();
// 件数が出る（ドラム式洗濯機と洗濯機用ラックの2件）
await manager.locator('li', { hasText: 'ヨドバシ' }).getByText('2件').waitFor();
// つまみをドラッグして、コストコをニトリの上へ
const order = () => sql('SELECT name FROM stores ORDER BY sort_order').map((r) => r.name);
const grip = manager.getByRole('button', { name: 'コストコの並び順を変える（ドラッグ、または↑↓キー）' });
await grip.scrollIntoViewIfNeeded();
// シートが出てくる動きの途中で座標を測ると、ずれた位置に落とすことになる
await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
const startIndex = order().indexOf('コストコ');
const target = await manager.locator('li', { hasText: 'ニトリ' }).boundingBox();
const box = await grip.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, target.y + 5, { steps: 12 });
await page.mouse.up();
await page.getByText('並び順を変更しました').waitFor();
await expectEventually(() => order().indexOf('コストコ') < startIndex - 1, 'ドラッグの並べ替えが保存される');
// キーボードの ↑ で1つ上げる
const before = order().indexOf('コストコ');
await grip.focus();
await page.keyboard.press('ArrowUp');
await expectEventually(() => order().indexOf('コストコ') === before - 1, 'キーボードの並べ替えが保存される');
// ジャンルに切り替える
await manager.getByRole('button', { name: 'ジャンル', exact: true }).click();
await manager.getByRole('button', { name: 'ジャンルを追加' }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-tag-manager.png` });
// 使っているジャンルを削除：移さずに外す
await manager.getByRole('button', { name: '洗濯機を削除' }).click();
const del = page.getByRole('dialog', { name: '「洗濯機」を削除' });
await del.getByText('使っているメモが 1 件あります').waitFor();
await del.getByLabel('移さずに外す').check();
await del.getByRole('button', { name: '削除する' }).click();
await expectEventually(() => sql("SELECT COUNT(*) AS n FROM genres WHERE name = '洗濯機'")[0].n === 0, 'ジャンルが消える');
assert.equal(sql("SELECT genre_id FROM memos WHERE title = '洗濯機用ラック'")[0].genre_id, null, 'メモのジャンルが外れる');
await page.keyboard.press('Escape');
const csv = await page.evaluate(() => fetch('/api/export.csv').then((r) => r.text()));
assert.ok(csv.includes('ドラム式洗濯機,,Amazon,179000') && csv.includes('ドラム式洗濯機,,ヨドバシ,189800'), 'CSV に候補が1行ずつ出る');
await noHorizontalScroll(page, '設定');

step('320px 幅でもはみ出さない');
await page.setViewportSize({ width: 320, height: 640 });
await page.getByRole('button', { name: '一覧に戻る' }).click();
await page.getByRole('heading', { name: '2人のメモ' }).waitFor();
await noHorizontalScroll(page, '一覧 320px');
await page.screenshot({ path: `${SHOTS}mobile-320.png` });

// ---------- PC 幅（同じログイン状態） ----------
step('PC：左に一覧、右に詳細');
const state = await mobileCtx.storageState();
const { page: desk } = await newPage({ width: 1280, height: 820 }, { storageState: state });
await desk.goto(BASE);
await desk.getByText('メモを選ぶと、ここに詳しく出ます').waitFor();
await desk.locator('.memo-row', { hasText: 'ドラム式洗濯機' }).getByRole('button', { name: /ドラム式洗濯機/ }).click();
await desk.getByRole('heading', { name: 'ドラム式洗濯機' }).waitFor();
assert.ok(desk.url().endsWith('/m/' + sql("SELECT id FROM memos WHERE title = 'ドラム式洗濯機'")[0].id), 'URL が個別のページになる');
await desk.screenshot({ path: `${SHOTS}desktop-detail.png` });
// 直接開いても詳細が出る
await desk.reload();
await desk.getByRole('heading', { name: 'ドラム式洗濯機' }).waitFor();

step('ダーク');
const { page: dark } = await newPage({ width: 390, height: 844 }, { storageState: state, colorScheme: 'dark', deviceScaleFactor: 2 });
await dark.goto(BASE);
await dark.locator('.memo-row').first().waitFor();
await dark.screenshot({ path: `${SHOTS}mobile-dark.png` });

step('おるが出てくる');
const { page: oru } = await newPage({ width: 390, height: 844 }, { storageState: state, deviceScaleFactor: 2 });
await oru.addInitScript(() => {
  localStorage.setItem('memo:oru:test', 'on');
  Math.random = () => 0.1;
});
await oru.goto(BASE);
await oru.getByRole('status', { name: 'おるからのひとこと' }).waitFor({ timeout: 8000 });
await oru.locator('.oru-bubble').waitFor({ timeout: 8000 });
await oru.waitForTimeout(1500);
await oru.screenshot({ path: `${SHOTS}mobile-oru.png` });

await browser.close();
const unexpected = consoleErrors.filter((e) => !/Failed to load resource: the server responded with a status of 40[49]/.test(e));
assert.deepEqual(unexpected, [], 'コンソールにエラーが出ていない');
console.log('E2E: すべて成功');
