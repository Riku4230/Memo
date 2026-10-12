import { yen } from '../../shared/format';
import { readLocal, writeLocal } from './storage';

/**
 * キャラクター「おる」の出方としゃべる内容（Kakeibo の lib/oru.ts から。数字のひとことをメモ向けに変えた）
 */

/** おるを出すか（端末ごと。設定でオフにできる） */
const ENABLED_KEY = 'memo:oru';
/** おるが今日出てきた回数と最後に出た時刻（{ date, count, at }）。続けて出すぎないよう、最後に出た時刻を見る */
const LAST_KEY = 'memo:oru:last';
/** アプリを開いた・戻ってきたときに出てくる確率（2回に1回くらい） */
export const ORU_CHANCE = 0.5;
/** メモを追加した・買ったを付けたときに出てくる確率（5回に1回くらい） */
export const ORU_REACT_CHANCE = 0.2;
/** 前に出てから次に出られるまでの間（ms） */
export const ORU_GAP_MS = 5 * 60 * 1000;

export function oruEnabled(): boolean {
  return readLocal(ENABLED_KEY) !== 'off';
}
/** いまおるを出せるか（設定でオンにしていて、自動テストのブラウザではない。テストで確かめるときは memo:oru:test） */
export function oruActive(): boolean {
  if (!oruEnabled()) return false;
  if (typeof navigator !== 'undefined' && navigator.webdriver && readLocal('memo:oru:test') !== 'on') return false;
  return true;
}
export function setOruEnabled(on: boolean): void {
  writeLocal(ENABLED_KEY, on ? 'on' : 'off');
}

/**
 * 前に出てから5分たっていれば（回数の上限はない）、確率で出す。出すと決めたら回数と時刻を覚える
 */
export function shouldOruAppear(today: string, random: () => number = Math.random, now: number = Date.now(), chance = ORU_CHANCE): boolean {
  if (!oruEnabled()) return false;
  let last: { date?: string; count?: number; at?: number } = {};
  try {
    last = JSON.parse(readLocal(LAST_KEY) ?? '{}') ?? {};
  } catch {
    // 読めなければ、初めて出るものとして扱う
  }
  const count = last.date === today ? (last.count ?? 1) : 0;
  if (last.at && now - last.at < ORU_GAP_MS) return false;
  if (random() >= chance) return false;
  writeLocal(LAST_KEY, JSON.stringify({ date: today, count: count + 1, at: now }));
  return true;
}

export interface OruLine {
  text: string;
  /** しゃべるときの動き */
  mood: 'talk' | 'sad' | 'jump';
}

/** いつでも使えるひとこと */
const PLAIN: OruLine[] = [
  { text: '欲しいもの、思いついた？', mood: 'talk' },
  { text: 'メモしておけば、忘れないよ', mood: 'talk' },
  { text: 'お店ごとの値段、くらべてみてね', mood: 'talk' },
  { text: 'ゆっくりえらぼうね〜', mood: 'talk' },
  { text: 'おるだよ〜。呼んだ？', mood: 'jump' },
  { text: 'のんびり見守ってるよ', mood: 'talk' },
  { text: 'かめは急がないの。お買い物もね', mood: 'talk' },
  { text: '買ったら、チェックを付けてね', mood: 'talk' },
  { text: '「購入先ごと」にすると、お店ごとに見られるよ', mood: 'talk' },
  { text: '詳しく書くと、あとで迷わないよ', mood: 'talk' },
  { text: '調べたページは、リンクで残せるよ', mood: 'talk' },
  { text: '値段を確かめた日も、覚えておくね', mood: 'talk' },
  { text: 'ほんとに欲しいか、ひと晩ねかせるのもあり', mood: 'talk' },
  { text: 'たまにはごほうびも、だいじ', mood: 'talk' },
  { text: 'こうらの中で、ひとやすみ…', mood: 'talk' },
  { text: 'ふたりで見ると、たのしいね', mood: 'jump' },
  { text: '押すと、おるは帰るよ〜', mood: 'talk' },
];

/** 時間帯のひとこと（端末の時刻で決める） */
export function timeLines(hour: number): OruLine[] {
  if (hour >= 5 && hour < 10) return [{ text: 'おはよう〜。今日もよろしくね', mood: 'jump' }];
  if (hour >= 11 && hour < 14) return [{ text: 'お昼休みに、ちょっと調べもの？', mood: 'talk' }];
  if (hour >= 17 && hour < 21) return [{ text: 'おつかれさま〜', mood: 'talk' }, { text: '帰りにお店、寄っていく？', mood: 'talk' }];
  if (hour >= 21 || hour < 2) return [{ text: '寝るまえのネットショッピングは、ほどほどにね', mood: 'talk' }];
  if (hour >= 2 && hour < 5) return [{ text: 'こんな時間まで…はやく寝てね', mood: 'sad' }];
  return [];
}

export interface OruFacts {
  /** 欲しいもの（まだ買っていない）の件数 */
  openCount: number;
  /** 欲しいものがいちばん多い購入先 */
  topStore: { name: string; count: number } | null;
  /** いちばん前に追加した、まだ買っていないメモ（30日以上前のときだけ） */
  oldest: { title: string; days: number } | null;
  /** 2つ以上の購入先で値段が分かっていて、いちばん安い店が分かるメモ */
  cheapest: { title: string; store: string; diff: number } | null;
  /** 値段が古い（30日以上前に確かめた）候補の数 */
  staleCount: number;
}

/** メモの数字から、言えるひとことを作る（言えるものがなければ空） */
export function factLines(f: OruFacts): OruLine[] {
  const lines: OruLine[] = [];
  if (f.openCount === 0) lines.push({ text: '欲しいものリスト、からっぽだね。思いついたら書いてね', mood: 'talk' });
  else lines.push({ text: `欲しいものが${f.openCount}件あるよ`, mood: 'talk' });
  if (f.topStore && f.topStore.count >= 2) lines.push({ text: `${f.topStore.name}で買うものが${f.topStore.count}件あるよ。今度まとめて行こう`, mood: 'jump' });
  if (f.oldest) lines.push({ text: `「${f.oldest.title}」、${f.oldest.days}日前のメモだよ。まだ欲しい？`, mood: 'talk' });
  if (f.cheapest) lines.push({ text: `「${f.cheapest.title}」は${f.cheapest.store}がいちばん安いよ（${yen(f.cheapest.diff)}円の差）`, mood: 'jump' });
  if (f.staleCount > 0) lines.push({ text: `値段が古いかもしれない候補が${f.staleCount}件あるよ`, mood: 'talk' });
  return lines;
}

/** メモの数字のひとこと（2回に1回）と、普通・時間帯のひとことを混ぜる */
export function pickOruLine(f: OruFacts | null, random: () => number = Math.random, hour: number = new Date().getHours()): OruLine {
  const facts = f ? factLines(f) : [];
  const pool = facts.length && random() < 1 / 2 ? facts : [...PLAIN, ...timeLines(hour)];
  return pool[Math.floor(random() * pool.length) % pool.length]!;
}

/** メモを追加したとき・買ったを付けたときのひとこと */
export const REACTIONS = {
  added: [
    { text: 'メモしたよ！', mood: 'jump' },
    { text: '覚えておくね〜', mood: 'talk' },
    { text: 'いいね、それ欲しいね', mood: 'jump' },
  ],
  done: [
    { text: '買えたね！おめでとう', mood: 'jump' },
    { text: 'いい買い物だったね〜', mood: 'jump' },
  ],
} satisfies Record<string, OruLine[]>;

const REACT_EVENT = 'memo:oru-react';

/** おるに反応してもらう（出るかどうかは OruCameo が確率と間隔で決める） */
export function oruReact(kind: keyof typeof REACTIONS): void {
  window.dispatchEvent(new CustomEvent(REACT_EVENT, { detail: kind }));
}
export function onOruReact(fn: (kind: keyof typeof REACTIONS) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<keyof typeof REACTIONS>).detail);
  window.addEventListener(REACT_EVENT, handler);
  return () => window.removeEventListener(REACT_EVENT, handler);
}
