// design/icon-source.png（1024px 四方・角丸なしの全面の絵。公開はしない）から、各サイズのアイコンを作る: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const source = readFileSync(new URL('../design/icon-source.png', import.meta.url)).toString('base64');
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();

/**
 * size: 出力の大きさ。rounded: 角を丸く切り抜く（透明）。scale < 1: 絵を中央に縮め、周りは絵をぼかしたもので埋める
 */
async function render(file, size, { rounded = false, scale = 1 } = {}) {
  const png = await page.evaluate(
    async ({ data, size, rounded, scale }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = new OffscreenCanvas(size, size);
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      if (rounded) {
        x.beginPath();
        x.roundRect(0, 0, size, size, size * 0.225);
        x.clip();
      }
      const inner = size * scale;
      const offset = (size - inner) / 2;
      if (scale < 1) {
        // 周りは、絵の左側（空と光。花の色が出ない部分）を広げてぼかしたもので埋め、絵は角丸にして載せる
        x.filter = `blur(${size / 16}px)`;
        x.drawImage(img, 60, 160, 300, 700, -size * 0.1, -size * 0.1, size * 1.2, size * 1.2);
        x.filter = 'none';
        x.beginPath();
        x.roundRect(offset, offset, inner, inner, inner * 0.225);
        x.clip();
      }
      x.drawImage(img, offset, offset, inner, inner);
      const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let s = '';
      for (const v of buf) s += String.fromCharCode(v);
      return btoa(s);
    },
    { data: source, size, rounded, scale },
  );
  writeFileSync(new URL(`../public/icons/${file}`, import.meta.url), Buffer.from(png, 'base64'));
}

await render('icon-192.png', 192, { rounded: true });
await render('icon-512.png', 512, { rounded: true });
// Android の maskable は中央 80% が安全領域
await render('icon-maskable-512.png', 512, { scale: 0.82 });
// iOS は自前で角丸に切り抜くため、角丸なし・全面で渡す
await render('apple-touch-icon.png', 180);
await browser.close();
