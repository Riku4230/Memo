// 主要な画面を Chromium で開き、e2e/screenshots/smoke/ に PNG を残す。
// サーバーは起動済みであること（scripts/test-e2e.mjs が起動する）。
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const SETUP_TOKEN = process.env.SETUP_TOKEN ?? 'local-dev-setup-token-1234567890';
const SHOTS = new URL('./screenshots/smoke/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
for (const name of readdirSync(SHOTS)) {
  if (name.endsWith('.png')) rmSync(`${SHOTS}${name}`);
}

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
  console.log(`- ${name}`);
}

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  timezoneId: 'Asia/Tokyo',
  locale: 'ja-JP',
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
await page.emulateMedia({ reducedMotion: 'reduce' });
const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: {
    protocol: 'ctap2',
    transport: 'internal',
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});

try {
  await page.goto(BASE);
  await page.getByLabel('セットアップ用トークン').waitFor();
  await shot(page, '01-setup');

  await page.getByLabel('セットアップ用トークン').fill(SETUP_TOKEN);
  await page.getByLabel('表示名').fill('りく');
  await page.getByRole('button', { name: 'パスキーを登録して始める' }).click();
  await page.getByLabel('コードを安全な場所に保存しました').check();
  await page.getByRole('button', { name: '続ける' }).click();
  await page.getByRole('heading', { name: '2人のメモ' }).waitFor();
  await page.getByText('まだメモがありません').waitFor();
  await shot(page, '02-home-empty');

  const input = page.getByLabel('欲しいもの', { exact: true });
  await input.fill('ブックスタンド');
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === 'POST' && res.url().includes('/api/memos') && res.ok()),
    input.press('Enter'),
  ]);
  await page.locator('.memo-row', { hasText: 'ブックスタンド' }).waitFor();
  await shot(page, '03-home');

  const state = await context.storageState();
  const desktop = await browser.newContext({
    storageState: state,
    viewport: { width: 1280, height: 800 },
    timezoneId: 'Asia/Tokyo',
    locale: 'ja-JP',
  });
  const desk = await desktop.newPage();
  await desk.emulateMedia({ reducedMotion: 'reduce' });
  await desk.goto(BASE);
  await desk.getByRole('heading', { name: '2人のメモ' }).waitFor();
  await desk.locator('.memo-row', { hasText: 'ブックスタンド' }).getByRole('button', { name: /^ブックスタンド/ }).click();
  await desk.getByRole('heading', { name: 'ブックスタンド' }).waitFor();
  await shot(desk, '04-home-desktop');
  await desktop.close();

  await page.locator('.memo-row', { hasText: 'ブックスタンド' }).getByRole('button', { name: /^ブックスタンド/ }).click();
  await page.getByRole('heading', { name: 'ブックスタンド' }).waitFor();
  await shot(page, '05-detail');

  await Promise.all([
    page.waitForResponse((res) => res.request().method() === 'PUT' && res.url().includes('/done') && res.ok()),
    page.getByRole('checkbox', { name: '「ブックスタンド」を買った' }).click(),
  ]);
  await page.goto(`${BASE}/bought`);
  await page.getByRole('heading', { name: '買ったもの' }).waitFor();
  await page.getByText('ブックスタンド').waitFor();
  await shot(page, '06-bought');

  await page.goto(`${BASE}/settings`);
  await page.getByRole('heading', { name: '設定' }).waitFor();
  await shot(page, '07-settings');
} catch (error) {
  await page.screenshot({ path: `${SHOTS}failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
