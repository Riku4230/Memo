import { useEffect, useState } from 'react';

/**
 * 画面のキーボードの高さ（px）。iPhone ではキーボードが出ても画面の下端は動かず、下に固定した入力欄がキーボードに隠れるため、
 * 見えている範囲（visualViewport）から高さを求め、入力欄をその分だけ上げる。キーボードがなければ 0
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const h = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      // アドレスバーの出し入れ程度の差は無視する
      setInset(h > 80 ? h : 0);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}
