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
assert.equal(sql('SELECT COUNT(*) AS n FROM categories')[0].n, 7, '初期の大カテゴリが作られている');
assert.equal(sql("SELECT COUNT(*) AS n FROM subcategories s JOIN categories c ON c.id = s.category_id WHERE c.name = '100均'")[0].n, 3, '100均の中カテゴリ');

step('すぐ登録：名前だけで追加');
const input = page.getByLabel('欲しいもの', { exact: true });
await input.fill('棚');
await input.press('Enter');
await page.locator('.memo-row', { hasText: '棚' }).waitFor();
assert.equal(await input.inputValue(), '', '追加したら入力欄が空になる');
await expectEventually(() => sql("SELECT COUNT(*) AS n FROM memos WHERE title = '棚'")[0].n === 1, 'メモが保存される');

step('すぐ登録：大カテゴリと中カテゴリを選んで追加');
await page.locator('.quick-add').getByRole('button', { name: /カテゴリ：なし/ }).click();
const pick = page.getByRole('dialog', { name: 'カテゴリを選ぶ' });
await pick.getByRole('button', { name: '100均' }).click();
await pick.getByRole('button', { name: 'ダイソー' }).click();
await pick.getByRole('button', { name: '決定' }).click();
await page.locator('.quick-add').getByRole('button', { name: /カテゴリ：100均 › ダイソー/ }).waitFor();
await input.fill('ブックスタンド');
await page.locator('.quick-add').getByRole('button', { name: '追加' }).click();
await page.locator('.memo-row', { hasText: 'ブックスタンド' }).locator('.category-badge', { hasText: '100均 › ダイソー' }).waitFor();
await expectEventually(
  () => sql("SELECT c.name AS c, s.name AS s FROM memos m JOIN categories c ON c.id = m.category_id JOIN subcategories s ON s.id = m.subcategory_id WHERE m.title = 'ブックスタンド'")[0]?.s === 'ダイソー',
  '大カテゴリ・中カテゴリが保存される',
);
// 選んだカテゴリは次の入力でも選んだまま
await page.locator('.quick-add').getByRole('button', { name: /カテゴリ：100均 › ダイソー/ }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-list.png` });

step('詳細：直す（大カテゴリを変え、中カテゴリをその場で足す・詳細メモ・リンク）');
await page.locator('.memo-row', { hasText: '棚' }).getByRole('button', { name: /^棚/ }).click();
await page.getByRole('heading', { name: '棚' }).waitFor();
await page.getByRole('button', { name: '直す' }).click();
const form = page.getByRole('dialog', { name: 'メモを直す' });
await form.getByRole('button', { name: '日用品' }).click();
await form.getByRole('group', { name: '中カテゴリ' }).getByRole('button', { name: '追加', exact: true }).click();
await form.getByLabel('新しい中カテゴリの名前').fill('ハック');
await form.getByLabel('新しい中カテゴリの名前').press('Enter');
await form.getByRole('button', { name: 'ハック', pressed: true }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-form.png` });
await form.getByLabel('値段（任意）').fill('１，９８０');
await form.getByLabel('詳細メモ').fill('幅60cmまで\n白');
await form.getByRole('button', { name: 'リンクを足す' }).click();
await form.getByLabel('リンク1の URL').fill('javascript:alert(1)');
await form.getByRole('button', { name: '保存する' }).click();
await form.getByText('http:// か https:// で始まる URL を入れてください').waitFor();
await form.getByLabel('リンク1の URL').fill('ここで見た https://example.com/item 送料無料');
await form.getByLabel('リンク1の表示名').fill('商品ページ');
await form.getByRole('button', { name: '保存する' }).click();
await form.waitFor({ state: 'detached' });
await page.locator('.category-badge', { hasText: '日用品 › ハック' }).waitFor();
await page.locator('.memo-price', { hasText: '1,980円' }).waitFor();
await page.getByText(/幅60cmまで\s+白/).waitFor();
assert.equal(await page.getByRole('link', { name: /商品ページ/ }).getAttribute('href'), 'https://example.com/item', '貼り付けた文章から URL だけを取り出す');
assert.equal(await page.getByRole('link', { name: /商品ページ/ }).getAttribute('rel'), 'noopener noreferrer');
await page.screenshot({ path: `${SHOTS}mobile-detail.png`, fullPage: true });
await noHorizontalScroll(page, '詳細');

step('一覧に戻る：値段・カテゴリごとの並べ方');
await page.getByRole('button', { name: '一覧に戻る' }).click();
await page.locator('.memo-row', { hasText: '棚' }).getByText('1,980円').waitFor();
await page.getByLabel('並べ方').selectOption('category');
const headings = await page.locator('.memo-section h2 span.flex-1').allTextContents();
assert.deepEqual(headings, ['100均', '日用品'], '大カテゴリごとの見出し');
await page.locator('.memo-section', { hasText: '100均' }).locator('h3', { hasText: 'ダイソー' }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-by-category.png`, fullPage: true });
await page.getByLabel('並べ方').selectOption('recent');

step('絞り込みとさがす');
await page.getByLabel('カテゴリで絞り込む').selectOption({ label: '100均' });
assert.equal(await page.locator('.memo-row').count(), 1);
await page.getByLabel('カテゴリで絞り込む').selectOption({ label: 'カテゴリ：すべて' });
await page.getByRole('button', { name: 'さがす' }).click();
await page.getByRole('searchbox', { name: 'さがす' }).fill('60CM');
assert.equal(await page.locator('.memo-row').count(), 1);
await page.getByRole('button', { name: 'さがす' }).click();
assert.equal(await page.locator('.memo-row').count(), 2);

step('買ったチェック・下の「買ったもの」を開く・買った日');
await page.getByRole('checkbox', { name: '「ブックスタンド」を買った' }).click();
await page.locator('.memo-row', { hasText: 'ブックスタンド' }).waitFor({ state: 'detached' });
// お知らせは保存の返事が来てから出るので、出るのを待ってから測る
await page.locator('.toast', { hasText: 'を買いました' }).waitFor();
const toastBox = await page.locator('.toast').boundingBox();
assert.ok(toastBox && toastBox.height < 60, `お知らせが折り返している（高さ ${toastBox?.height}px）`);
await expectEventually(() => sql("SELECT done_at FROM memos WHERE title = 'ブックスタンド'")[0].done_at !== null, '買ったが保存される');
assert.equal(await page.getByRole('button', { name: '買ったものも表示' }).count(), 0, '左上の丸は出さない');
// 買ったものは一覧のいちばん下に畳んである。押すと開く
const doneFold = page.locator('.done-section').getByRole('button', { name: /買ったもの/ });
assert.equal(await doneFold.getAttribute('aria-expanded'), 'false');
assert.equal(await page.locator('.done-section .memo-row').count(), 0);
await doneFold.click();
await page.locator('.done-section .memo-row', { hasText: 'ブックスタンド' }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-show-done.png` });
// 買ったものの詳細には買った日が出る
await page.locator('.done-section .memo-row').getByRole('button', { name: /ブックスタンド/ }).click();
const today = new Date();
await page.locator('.done-date', { hasText: `${today.getMonth() + 1}/${today.getDate()}に買った` }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-done-detail.png` });
await page.getByRole('button', { name: '一覧に戻る' }).click();
await page.locator('.done-section').getByRole('checkbox', { name: '「ブックスタンド」を買った' }).click();
await expectEventually(() => sql("SELECT done_at FROM memos WHERE title = 'ブックスタンド'")[0].done_at === null, '欲しいに戻る');
await page.locator('.done-section').waitFor({ state: 'detached' });
// 買う前のものの詳細には買った日は出さない
await page.locator('.memo-row', { hasText: 'ブックスタンド' }).getByRole('button', { name: /ブックスタンド/ }).click();
await page.locator('.memo-detail').waitFor();
assert.equal(await page.locator('.done-date').count(), 0);
await page.getByRole('button', { name: '一覧に戻る' }).click();

step('相手の変更が、開いたままの一覧に15秒ほどで出る');
// もう1人がほかの端末で追加したことにする（DB に直接入れる。トリガーで「変わった番号」が上がる）
sql("INSERT INTO memos (id, title, created_at, updated_at) VALUES ('e2e-partner', '相手が足した電池', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')");
await page.locator('.memo-row', { hasText: '相手が足した電池' }).waitFor({ timeout: 25_000 });
sql("DELETE FROM memos WHERE id = 'e2e-partner'");
await page.locator('.memo-row', { hasText: '相手が足した電池' }).waitFor({ state: 'detached', timeout: 25_000 });

step('消す・元に戻す');
await page.locator('.memo-row', { hasText: 'ブックスタンド' }).getByRole('button', { name: /ブックスタンド/ }).click();
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'このメモを消す' }).click();
await page.getByRole('heading', { name: '2人のメモ' }).waitFor();
await page.getByRole('button', { name: '元に戻す' }).click();
await page.locator('.memo-row', { hasText: 'ブックスタンド' }).waitFor();
await expectEventually(() => sql("SELECT deleted_at FROM memos WHERE title = 'ブックスタンド'")[0].deleted_at === null, '元に戻る');

step('設定：カテゴリの管理（追加・並べ替え・中カテゴリ・削除）・CSV');
await page.getByRole('button', { name: '設定' }).click();
await page.getByRole('heading', { name: '設定' }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-settings.png`, fullPage: true });
await page.getByRole('button', { name: /カテゴリの管理/ }).click();
const manager = page.getByRole('dialog', { name: 'カテゴリの管理' });
await manager.getByRole('button', { name: '大カテゴリを追加' }).click();
await page.getByLabel('名前（20文字まで）').fill('本');
await page.getByRole('button', { name: '追加する' }).click();
await manager.getByText('本', { exact: true }).waitFor();
// 件数が出る（100均はブックスタンドの1件）
await manager.locator('li', { hasText: '100均' }).getByText(/^1件/).waitFor();
// つまみをドラッグして、本を服の上へ
const order = () => sql('SELECT name FROM categories ORDER BY sort_order').map((r) => r.name);
const grip = manager.getByRole('button', { name: '本の並び順を変える（ドラッグ、または↑↓キー）' });
await grip.scrollIntoViewIfNeeded();
// シートが出てくる動きの途中で座標を測ると、ずれた位置に落とすことになる
await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
const startIndex = order().indexOf('本');
const target = await manager.locator('li', { hasText: '服' }).boundingBox();
const box = await grip.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, target.y + 5, { steps: 12 });
await page.mouse.up();
await page.getByText('並び順を変更しました').waitFor();
await expectEventually(() => order().indexOf('本') < startIndex, 'ドラッグの並べ替えが保存される');
// キーボードの ↑ で1つ上げる
const before = order().indexOf('本');
await grip.focus();
await page.keyboard.press('ArrowUp');
await expectEventually(() => order().indexOf('本') === before - 1, 'キーボードの並べ替えが保存される');
// 編集から中カテゴリを足す
await manager.getByRole('button', { name: '本を編集' }).click();
const editor = page.getByRole('dialog', { name: '大カテゴリを編集' });
await editor.getByLabel('追加する中カテゴリの名前').fill('マンガ');
await editor.getByLabel('追加する中カテゴリの名前').press('Enter');
await editor.getByText('マンガ', { exact: true }).waitFor();
await expectEventually(() => sql("SELECT COUNT(*) AS n FROM subcategories WHERE name = 'マンガ'")[0].n === 1, '中カテゴリが保存される');
await page.screenshot({ path: `${SHOTS}mobile-category-editor.png` });
await editor.getByRole('button', { name: '閉じる' }).click();
// 使っている大カテゴリを削除：移さずに外す
await manager.getByRole('button', { name: '日用品を削除' }).click();
const del = page.getByRole('dialog', { name: '「日用品」を削除' });
await del.getByText('使っているメモが 1 件あります').waitFor();
await del.getByLabel('移さずに外す').check();
await del.getByRole('button', { name: '削除する' }).click();
await expectEventually(() => sql("SELECT COUNT(*) AS n FROM categories WHERE name = '日用品'")[0].n === 0, '大カテゴリが消える');
assert.equal(sql("SELECT category_id FROM memos WHERE title = '棚'")[0].category_id, null, 'メモの大カテゴリが外れる');
await page.keyboard.press('Escape');
const csv = await page.evaluate(() => fetch('/api/export.csv').then((r) => r.text()));
assert.ok(csv.includes('ブックスタンド,100均,ダイソー,,欲しい'), 'CSV に大カテゴリ・中カテゴリ・値段の列が出る');
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
await desk.locator('.memo-row', { hasText: 'ブックスタンド' }).getByRole('button', { name: /ブックスタンド/ }).click();
await desk.getByRole('heading', { name: 'ブックスタンド' }).waitFor();
assert.ok(desk.url().endsWith('/m/' + sql("SELECT id FROM memos WHERE title = 'ブックスタンド'")[0].id), 'URL が個別のページになる');
await desk.screenshot({ path: `${SHOTS}desktop-detail.png` });
// 直接開いても詳細が出る
await desk.reload();
await desk.getByRole('heading', { name: 'ブックスタンド' }).waitFor();

step('ダーク');
const { page: dark } = await newPage({ width: 390, height: 844 }, { storageState: state, colorScheme: 'dark', deviceScaleFactor: 2 });
await dark.goto(BASE);
await dark.locator('.memo-row').first().waitFor();
await dark.screenshot({ path: `${SHOTS}mobile-dark.png` });
// ダークのお知らせ（白地）でも読める色か
await dark.locator('.memo-row').first().getByRole('checkbox').click();
await dark.locator('.toast', { hasText: 'を買いました' }).waitFor();
await dark.screenshot({ path: `${SHOTS}mobile-dark-toast.png` });
await dark.locator('.toast').getByRole('button', { name: '元に戻す' }).click();

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
