// Kakeibo の src/client/lib/update.ts から（Kakeibo 側で直したら合わせる）
/**
 * 新しい版の自動更新。
 * ホーム画面に追加したアプリは、裏に置いたまま戻ると前の画面のまま動き続けるため、
 * 画面に戻ってきたとき（と、開いている間は30分ごと）に公開中の版の目印（/version.json）を確かめ、変わっていたら読み直す。
 * 入力中の画面（シートや入力欄）を開いているあいだは読み直さず、閉じてから読み直す
 */
const CHECK_EVERY_MS = 30 * 60 * 1000;
const RETRY_MS = 15 * 1000;

async function publishedId(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: unknown };
    return typeof body.id === 'string' ? body.id : null;
  } catch {
    return null;
  }
}

/** 入力の途中かもしれないとき（シートが開いている・文字を入力中）は、読み直さない */
function busy(): boolean {
  const active = document.activeElement;
  return !!document.querySelector('[role="dialog"]') || !!(active && active.matches('input, textarea, select, [contenteditable="true"]'));
}

export function startUpdateWatcher(): () => void {
  let current: string | null = null;
  let pending = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const reloadWhenIdle = () => {
    clearTimeout(retry);
    if (document.visibilityState !== 'visible') return;
    if (busy()) {
      retry = setTimeout(reloadWhenIdle, RETRY_MS);
      return;
    }
    window.location.reload();
  };
  const check = async () => {
    if (pending) return reloadWhenIdle();
    const id = await publishedId();
    if (!id) return;
    if (current === null) current = id;
    else if (id !== current) {
      pending = true;
      reloadWhenIdle();
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  void check();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);
  const timer = setInterval(onVisible, CHECK_EVERY_MS);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onVisible);
    clearInterval(timer);
    clearTimeout(retry);
  };
}
