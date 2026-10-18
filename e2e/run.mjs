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

// 音声入力の確認用に、許可を聞かずに偽のマイク（一定の音が鳴り続ける）を使う
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
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

function categoryIdOf(name) {
  return sql(`SELECT id FROM categories WHERE name = '${name}'`)[0].id;
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
// 登録したらカテゴリも選び直しになる
await page.locator('.quick-add').getByRole('button', { name: /カテゴリ：なし/ }).waitFor();
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

step('詳細：その場で直す（値段・名前・詳細メモ・カテゴリ）');
const memoId = sql("SELECT id FROM memos WHERE title = '棚'")[0].id;
const memoRow = () => sql(`SELECT title, price, body, category_id FROM memos WHERE id = '${memoId}'`)[0];
// 値段：押すと入力欄になり、Enter で保存
await page.locator('.memo-props').getByRole('button', { name: '1,980円' }).click();
await page.getByLabel('値段', { exact: true }).fill('2480');
await page.getByLabel('値段', { exact: true }).press('Enter');
await page.locator('.memo-price', { hasText: '2,480円' }).waitFor();
await expectEventually(() => memoRow().price === 2480, '値段がその場で保存される');
// Esc ではやめる
await page.locator('.memo-props').getByRole('button', { name: '2,480円' }).click();
await page.getByLabel('値段', { exact: true }).fill('9');
await page.getByLabel('値段', { exact: true }).press('Escape');
await page.locator('.memo-price', { hasText: '2,480円' }).waitFor();
assert.equal(memoRow().price, 2480, 'Esc では保存しない');
// 名前
await page.getByRole('heading', { name: '棚' }).getByRole('button').click();
await page.getByLabel('名前', { exact: true }).fill('白い棚');
await page.getByLabel('名前', { exact: true }).press('Enter');
await page.getByRole('heading', { name: '白い棚' }).waitFor();
await expectEventually(() => memoRow().title === '白い棚', '名前がその場で保存される');
// 詳細メモ：押すと書け、欄の外を押すと保存
await page.locator('.memo-body').click();
await page.getByLabel('詳細メモ', { exact: true }).fill('幅60cmまで\n白\n奥行き30cm');
await page.locator('.memo-props').click({ position: { x: 2, y: 2 } });
await expectEventually(() => memoRow().body.includes('奥行き30cm'), '詳細メモがその場で保存される');
// カテゴリ：押すと選ぶ画面が出て、選ぶと保存
await page.locator('.memo-props').getByRole('button', { name: /カテゴリ：日用品 › ハック/ }).click();
const picker = page.getByRole('dialog', { name: 'カテゴリを選ぶ' });
await picker.getByRole('button', { name: '家具' }).click();
await picker.getByRole('button', { name: '決定' }).click();
await page.locator('.memo-props .category-badge', { hasText: '家具' }).waitFor();
await expectEventually(() => memoRow().category_id === categoryIdOf('家具'), 'カテゴリがその場で保存される');
await page.screenshot({ path: `${SHOTS}mobile-detail-inline.png`, fullPage: true });
// 後の確認のために元に戻す
await page.getByRole('button', { name: '直す' }).click();
const restore = page.getByRole('dialog', { name: 'メモを直す' });
await restore.getByLabel('名前').fill('棚');
await restore.getByLabel('値段（任意）').fill('1980');
await restore.getByRole('button', { name: '日用品' }).click();
await restore.getByRole('button', { name: 'ハック' }).click();
await restore.getByRole('button', { name: '保存する' }).click();
await restore.waitFor({ state: 'detached' });
await page.getByRole('heading', { name: '棚' }).waitFor();

step('一覧に戻る：値段・カテゴリごとの並べ方');
await page.getByRole('button', { name: '一覧に戻る' }).click();
await page.locator('.memo-row', { hasText: '棚' }).getByText('1,980円').waitFor();
await page.getByLabel('並べ方').selectOption('category');
const headings = await page.locator('.memo-section h2 .section-name').allTextContents();
assert.deepEqual(headings, ['100均', '日用品'], '大カテゴリごとの見出し');
await page.locator('.memo-section', { hasText: '100均' }).locator('h3', { hasText: 'ダイソー' }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-by-category.png`, fullPage: true });
await page.getByLabel('並べ方').selectOption('recent');

step('絞り込みとさがす');
await page.getByLabel('カテゴリで絞り込む').selectOption({ label: '100均' });
assert.equal(await page.locator('.memo-row').count(), 1);
// 絞り込んでいる間は、すぐ登録のカテゴリもその大カテゴリになる
await page.locator('.quick-add').getByRole('button', { name: /カテゴリ：100均（/ }).waitFor();
// 中カテゴリの名前でも絞り込める。中カテゴリが1つに決まれば、すぐ登録もそのカテゴリになる
await page.getByLabel('カテゴリで絞り込む').selectOption({ label: 'ダイソー' });
assert.deepEqual(await page.locator('.memo-row .memo-title').allTextContents(), ['ブックスタンド']);
await page.locator('.quick-add').getByRole('button', { name: /カテゴリ：100均 › ダイソー（/ }).waitFor();
await page.getByLabel('カテゴリで絞り込む').selectOption({ label: 'カテゴリ：すべて' });
await page.locator('.quick-add').getByRole('button', { name: /カテゴリ：なし/ }).waitFor();
// さがすは、カテゴリの名前でも見つかる
await page.getByRole('button', { name: 'さがす' }).click();
await page.getByRole('searchbox', { name: 'さがす' }).fill('ハック');
assert.deepEqual(await page.locator('.memo-row .memo-title').allTextContents(), ['棚']);
await page.getByRole('button', { name: 'さがす' }).click();
await page.getByRole('button', { name: 'さがす' }).click();
await page.getByRole('searchbox', { name: 'さがす' }).fill('60CM');
assert.equal(await page.locator('.memo-row').count(), 1);
await page.getByRole('button', { name: 'さがす' }).click();
assert.equal(await page.locator('.memo-row').count(), 2);

step('買ったチェック：今日買ったものはその場に残る・左上の丸で履歴・買った日');
await page.getByRole('checkbox', { name: '「ブックスタンド」を買った' }).click();
// 今日買ったものは一覧から消さず、点線のブロックで残し、誰が買ったかを出す
await page.locator('.memo-row.is-got', { hasText: 'ブックスタンド' }).waitFor();
await page.locator('.memo-row.is-got .bought-line', { hasText: 'りくが買った' }).waitFor();
// お知らせは保存の返事が来てから出るので、出るのを待ってから測る
await page.locator('.toast', { hasText: 'を買いました' }).waitFor();
const toastBox = await page.locator('.toast').boundingBox();
assert.ok(toastBox && toastBox.height < 60, `お知らせが折り返している（高さ ${toastBox?.height}px）`);
await expectEventually(() => sql("SELECT done_at FROM memos WHERE title = 'ブックスタンド'")[0].done_at !== null, '買ったが保存される');
await page.locator('.bought-link', { hasText: '今日1件' }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-bought-inline.png` });
// 左上の丸で買ったものの履歴を開く（丸に件数は出さない）
const historyBtn = page.getByRole('button', { name: '買ったものの履歴' }).first();
assert.equal((await historyBtn.textContent()).trim(), '', '左上の丸に件数は出さない');
await historyBtn.click();
await page.locator('.bought-day', { hasText: '今日' }).locator('.bought-row', { hasText: 'ブックスタンド' }).waitFor();
assert.ok(page.url().endsWith('/bought'), '履歴の URL');
await page.screenshot({ path: `${SHOTS}mobile-bought-history.png` });
// 買ったものの詳細には買った日が出る
await page.locator('.bought-row .memo-title', { hasText: 'ブックスタンド' }).click();
// 画面は日本時間で出すので、今日の日付も日本時間で作る（UTC で作ると、日本の0〜9時に1日ずれる）
const today = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(new Date());
await page.locator('.done-date', { hasText: `${today}に買った` }).waitFor();
await page.screenshot({ path: `${SHOTS}mobile-done-detail.png` });
// 詳細から戻ると履歴、履歴から戻ると一覧
await page.getByRole('button', { name: '一覧に戻る' }).click();
await page.locator('.bought-row').first().waitFor();
await page.getByRole('button', { name: '一覧に戻る' }).click();
// 一覧のその場で取り消せる
await page.getByRole('button', { name: '「ブックスタンド」の買ったを取り消す' }).click();
await expectEventually(() => sql("SELECT done_at FROM memos WHERE title = 'ブックスタンド'")[0].done_at === null, '欲しいに戻る');
await page.locator('.memo-row.is-got').waitFor({ state: 'detached' });
// 買う前のものの詳細には買った日は出さない
await page.locator('.memo-row', { hasText: 'ブックスタンド' }).getByRole('button', { name: /ブックスタンド/ }).click();
await page.locator('.memo-detail').waitFor();
assert.equal(await page.locator('.done-date').count(), 0);
// 値段を入れていないメモでも、値段の欄は出す（押すと入れられる）
await page.locator('.memo-price-empty').waitFor();
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

step('音声入力：録音中は波線が動き、止めると下書きをまとめて直して登録できる');
await page.getByRole('button', { name: '音声で入力' }).click();
const listening = page.getByRole('dialog', { name: '聞いています' });
await listening.waitFor();
// 偽のマイクの音で、波線が平らでなくなる（声を拾えていることが見て分かる）
await expectEventually(
  () => page.locator('.voice-wave span').evaluateAll((bars) => bars.some((b) => parseFloat(b.style.height) > 10)),
  '声の大きさに合わせて波線が動く',
);
await page.screenshot({ path: `${SHOTS}mobile-voice-listening.png` });
await listening.getByRole('button', { name: '止めて下書きを作る' }).click();
const confirmSheet = page.getByRole('dialog', { name: '以下を登録します' });
await confirmSheet.waitFor();
// API キーのないローカルではお試し版（固定のサンプル2件）
await confirmSheet.getByText('お試し版です').waitFor();
assert.equal(await confirmSheet.locator('.voice-draft').count(), 2);
await confirmSheet.getByLabel('2件目のカテゴリ：100均 › ダイソー（押して選ぶ）').waitFor();
assert.equal(await confirmSheet.getByLabel('2件目の値段').inputValue(), '330');
await noHorizontalScroll(page, '音声入力の確認 320px');
await page.screenshot({ path: `${SHOTS}mobile-voice-confirm.png` });
await confirmSheet.getByLabel('1件目の名前').fill('食器用洗剤');
await confirmSheet.getByLabel('1件目の詳細メモ').fill('詰め替え');
await confirmSheet.getByRole('button', { name: '2件目を外す' }).click();
await confirmSheet.getByRole('button', { name: '1件を追加する' }).click();
await confirmSheet.waitFor({ state: 'detached' });
await page.locator('.memo-row', { hasText: '食器用洗剤' }).waitFor();
await expectEventually(() => sql("SELECT body FROM memos WHERE title = '食器用洗剤'")[0]?.body === '詰め替え', '音声入力の下書きが登録される');
assert.equal(sql("SELECT COUNT(*) AS n FROM memos WHERE title = '単3電池'")[0].n, 0, '外した下書きは登録しない');

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
// PC：買ったものはその場に残り、履歴から「もう一度」で同じ中身の欲しいものを作れる
await desk.getByRole('checkbox', { name: '「ブックスタンド」を買った' }).first().click();
await expectEventually(() => sql("SELECT done_at FROM memos WHERE title = 'ブックスタンド'")[0].done_at !== null, 'PC で買ったが保存される');
await desk.locator('.memo-row.is-got', { hasText: 'ブックスタンド' }).waitFor();
await desk.getByRole('button', { name: '買ったものの履歴' }).first().click();
await desk.locator('.bought-row', { hasText: 'ブックスタンド' }).waitFor();
await desk.screenshot({ path: `${SHOTS}desktop-bought-history.png` });
await desk.getByRole('button', { name: '「ブックスタンド」をもう一度欲しいものに入れる' }).click();
await desk.locator('.bought-row', { hasText: 'ブックスタンド' }).getByRole('button', { name: /もう一度/ }).filter({ hasText: '入れた' }).waitFor();
await expectEventually(() => {
  const rows = sql("SELECT done_at, category_id, subcategory_id FROM memos WHERE title = 'ブックスタンド' AND deleted_at IS NULL ORDER BY created_at");
  return rows.length === 2 && rows[1].done_at === null && rows[1].category_id === rows[0].category_id && rows[1].subcategory_id === rows[0].subcategory_id;
}, 'もう一度：同じカテゴリで新しい欲しいものができ、元は買った記録として残る');
await desk.getByRole('button', { name: '一覧に戻る' }).click();
await desk.locator('.memo-row:not(.is-got)', { hasText: 'ブックスタンド' }).waitFor();

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
// メモが多いときのカテゴリごとの見た目（見出しとメモの大きさの差、すき間のリズム）を見る
const subIdOf = (c, s) => sql(`SELECT s.id FROM subcategories s JOIN categories c ON c.id = s.category_id WHERE c.name = '${c}' AND s.name = '${s}'`)[0].id;
const extra = [
  { title: 'パン', categoryId: categoryIdOf('食品'), subcategoryId: subIdOf('食品', 'スーパー') },
  { title: '牛乳', categoryId: categoryIdOf('食品'), subcategoryId: subIdOf('食品', 'スーパー'), price: 248 },
  { title: 'たまご', categoryId: categoryIdOf('食品'), subcategoryId: null },
  { title: '収納ケース', categoryId: categoryIdOf('100均'), subcategoryId: subIdOf('100均', 'セリア') },
  { title: 'テーブルの脚カバー', categoryId: categoryIdOf('100均'), subcategoryId: subIdOf('100均', 'セリア'), body: '4個入りのもの' },
];
for (const m of extra) {
  const status = await dark.evaluate((m) => fetch('/api/memos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) }).then((r) => r.status), m);
  assert.equal(status, 201, `「${m.title}」を足す`);
}
await dark.reload();
await dark.getByLabel('並べ方').selectOption('category');
await dark.locator('.memo-section', { hasText: '食品' }).locator('h3', { hasText: 'スーパー' }).waitFor();
await noHorizontalScroll(dark, 'ダークのカテゴリごと');
await dark.screenshot({ path: `${SHOTS}mobile-dark-by-category.png`, fullPage: true });
await dark.setViewportSize({ width: 320, height: 640 });
await noHorizontalScroll(dark, 'ダークのカテゴリごと 320px');
await dark.screenshot({ path: `${SHOTS}mobile-dark-by-category-320.png`, fullPage: true });

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
