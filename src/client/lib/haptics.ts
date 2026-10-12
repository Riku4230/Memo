// Kakeibo の src/client/lib/haptics.ts から（Kakeibo 側で直したら合わせる）
/**
 * 軽い振動で操作を伝える（並び替えで順番が入れ替わったとき、長押しが決まったときなど）。
 * Android などは Vibration API を使う。iPhone の Safari には Vibration API がないため、
 * iOS 18 からの「スイッチ（<input type="checkbox" switch>）を切り替えると端末が軽く震える」仕組みを、見えないスイッチで使う。
 * どちらもない端末・設定で振動を切っている端末では何も起きない
 */
let toggle: HTMLLabelElement | null = null;

function iosToggle(): HTMLLabelElement | null {
  if (toggle) return toggle;
  if (typeof document === 'undefined') return null;
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-100px;top:0';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  toggle = label;
  return label;
}

export function haptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
      return;
    }
    iosToggle()?.click();
  } catch {
    // 振動できなくても操作は続ける
  }
}
