import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { ORU_REACT_CHANCE, REACTIONS, oruActive, onOruReact, pickOruLine, shouldOruAppear, type OruFacts, type OruLine } from '../lib/oru';
import { ORU_NAME, Oru, SpeechBubble, prefersReducedMotion, type OruAnim } from './Oru';

/** 歩いて出てくる・帰っていく時間（CSS の transition と合わせる） */
const WALK_MS = 1400;
/** しゃべり終わってから帰るまで（✕ やおるを押せばすぐ帰る） */
const STAY_MS = 3000;

type Phase = 'hidden' | 'in' | 'wave' | 'talk' | 'out';

/** シートを開いている・文字を入力しているとき（すぐ登録の邪魔をしない） */
function busy(): boolean {
  return !!document.querySelector('[role="dialog"]') || !!document.activeElement?.matches('input, textarea, select');
}

/**
 * ときどき（アプリを開いた・戻ってきたときに2回に1回くらい。前に出てから5分はあける）、画面の右下からおるが歩いてきて、ひとことしゃべって帰る。
 * メモを追加した・買ったを付けたときも、ときどき（5回に1回くらい）出てきて反応する。
 * 入力欄の少し上に出し、ボタンにかぶらないようにする。シートを開いている間・入力中は出さない。押すとすぐ帰る
 * （Kakeibo の OruCameo から。反応を足した）
 */
export function OruCameo({ today, facts, bottomClass }: { today: string; facts: () => OruFacts | null; bottomClass: string }) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [line, setLine] = useState<OruLine | null>(null);
  const factsRef = useRef(facts);
  factsRef.current = facts;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  useEffect(() => {
    // 自動テストのブラウザでは、確かめるとき（memo:oru:test）以外は出さない（ほかの操作の邪魔にならないように）
    if (!oruActive()) return;
    const show = (fixed: OruLine | null, waitIdle: boolean) => {
      if (phaseRef.current !== 'hidden') return;
      if (document.visibilityState !== 'visible' || (waitIdle && busy())) return later(() => show(fixed, waitIdle), 4000);
      setLine(fixed ?? pickOruLine(factsRef.current()));
      setPhase('in');
      later(() => setPhase('wave'), prefersReducedMotion() ? 0 : WALK_MS);
      later(() => setPhase('talk'), prefersReducedMotion() ? 0 : WALK_MS + 900);
    };
    // アプリを開いたときと、ほかのアプリから戻ってきたとき（ホーム画面のアプリは開き直さず戻ることが多い）にくじを引く
    const roll = () => {
      if (oruActive() && shouldOruAppear(today)) later(() => show(null, true), 2500);
    };
    roll();
    const onVisible = () => document.visibilityState === 'visible' && roll();
    document.addEventListener('visibilitychange', onVisible);
    // 追加・買ったのときは、続けて入力していても出る（入力欄の上に出るので邪魔にならない）
    const offReact = onOruReact((kind) => {
      if (!oruActive() || !shouldOruAppear(today, Math.random, Date.now(), ORU_REACT_CHANCE)) return;
      const lines = REACTIONS[kind];
      later(() => show(lines[Math.floor(Math.random() * lines.length)]!, false), 400);
    });
    const list = timers.current;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      offReact();
      list.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const leave = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    setPhase('out');
    later(() => setPhase('hidden'), prefersReducedMotion() ? 0 : WALK_MS);
  };

  if (phase === 'hidden' || !line) return null;
  const anim: OruAnim = phase === 'in' ? 'walkLeft' : phase === 'out' ? 'walkRight' : phase === 'wave' ? 'wave' : line.mood;
  const away = phase === 'out';
  return (
    <div className={clsx('oru-cameo pointer-events-none fixed right-2 z-30 flex items-end gap-1 lg:right-6', bottomClass)} role="status" aria-label={`${ORU_NAME}からのひとこと`}>
      {phase === 'talk' && (
        <SpeechBubble className="pointer-events-auto mb-10 max-w-[min(280px,calc(100vw-100px))] animate-pop-in" tail="right" text={line.text} onDone={() => later(leave, STAY_MS)} onClose={leave} />
      )}
      <button
        type="button"
        aria-label={`${ORU_NAME}を帰す`}
        className={clsx('oru-walker pointer-events-auto transition-transform ease-linear', phase === 'in' && 'oru-enter')}
        style={{ transitionDuration: `${WALK_MS}ms`, transform: away ? 'translateX(140%)' : undefined }}
        onClick={leave}
      >
        <Oru anim={anim} size={72} />
      </button>
    </div>
  );
}
