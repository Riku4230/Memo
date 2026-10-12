import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const apiTarget = 'http://localhost:8787';

/** ビルドごとに Service Worker のキャッシュ名を変え、古い画面ファイルが端末に残り続けないようにする。版の目印 version.json も書き出す */
function serviceWorkerVersion(): Plugin {
  return {
    name: 'sw-version',
    apply: 'build',
    closeBundle() {
      const html = readFileSync('dist/index.html', 'utf8');
      const id = createHash('sha256').update(html).digest('hex').slice(0, 12);
      const sw = readFileSync('dist/sw.js', 'utf8');
      if (!sw.includes('__BUILD_ID__')) throw new Error('sw.js にビルドIDの目印がありません');
      writeFileSync('dist/sw.js', sw.replaceAll('__BUILD_ID__', id));
      // 開いている画面が、新しい版が公開されたことに気づくための目印（src/client/lib/update.ts）
      writeFileSync('dist/version.json', JSON.stringify({ id }));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerVersion()],
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        configure: (proxy) => {
          // Worker 側の Origin 検証を通すため、開発時のみ Origin を API 側に揃える
          proxy.on('proxyReq', (req) => req.setHeader('origin', apiTarget));
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // 小さいフォント等を data: URI で埋め込むと CSP（font-src 'self'）で拒否されるため、常に別ファイルにする
    assetsInlineLimit: 0,
  },
});
