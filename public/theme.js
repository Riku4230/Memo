/* Kakeibo の public/theme.js から（Kakeibo 側で直したら合わせる） */
// 画面の明るさ（自動 / ライト / ダーク）。画面を描く前に読み込み、一瞬だけ違う色で表示されるのを防ぐ。
// 設定はこの端末だけ（localStorage）。src/client/lib/theme.ts と同じ決まりで <html data-theme> を付ける
(function () {
  var KEY = 'memo-theme';
  var COLORS = { light: '#ffffff', dark: '#18181b' };
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function choice() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch (e) {
      return 'system';
    }
  }
  function apply() {
    var c = choice();
    var theme = c === 'system' ? (media.matches ? 'dark' : 'light') : c;
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COLORS[theme]);
  }
  apply();
  // 「自動」のときは端末の切り替えに合わせる。設定画面で変えたときは memo-theme-change で知らせる
  media.addEventListener('change', apply);
  window.addEventListener('memo-theme-change', apply);
})();
