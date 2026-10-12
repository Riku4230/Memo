import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      // URL の取り出し・値段の比べ方・一覧の組み立てなど、Node で動く単体テスト
      { test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' } },
      // Workers の実行環境（D1 含む）で API を呼び出す結合テスト
      {
        plugins: [
          cloudflareTest(async () => ({
            main: './src/worker/index.ts',
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations('./migrations'),
                SETUP_TOKEN: 'test-setup-token-0123456789',
              },
            },
          })),
        ],
        test: { name: 'worker', include: ['test/worker/**/*.test.ts'], setupFiles: ['./test/worker/setup.ts'] },
      },
    ],
  },
});
