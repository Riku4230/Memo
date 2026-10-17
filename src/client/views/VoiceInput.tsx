import clsx from 'clsx';
import { ChevronDown, Loader2, Mic, Square, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VoiceDraft, VoiceResponse } from '../../shared/types';
import { api, errorText } from '../api';
import { CategoryBadge } from '../components/CategoryBadge';
import { CategoryPickerSheet } from '../components/CategoryPicker';
import { PriceInput } from '../components/PriceInput';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';
import { haptic } from '../lib/haptics';
import { oruReact } from '../lib/oru';
import { canRecord, MAX_RECORD_SECONDS, startRecording, type Recording } from '../lib/recorder';

/** 波線の本数 */
const BARS = 28;

type Phase = { kind: 'idle' } | { kind: 'recording' } | { kind: 'thinking' } | { kind: 'confirm'; result: VoiceResponse };

/**
 * 音声入力のボタン。押すと録音が始まり、もう一度押す（または止めるボタン）で止まる。
 * 録った声は Gemini で「名前・値段・カテゴリ・詳細メモ」の下書きにして、確認画面でまとめて直してから登録する
 */
export function VoiceButton() {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [seconds, setSeconds] = useState(0);
  const recording = useRef<Recording | null>(null);
  const latest = useRef(0);

  // 録音中：声の大きさを波線に流し、経過時間を数える。上限の時間で自動で止める
  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setLevels((prev) => [...prev.slice(1), latest.current]);
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_RECORD_SECONDS) void stop();
    }, 60);
    return () => window.clearInterval(timer);
    // stop は毎回作り直されるが、録音中に中身は変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind]);

  // 画面を離れたら録音を捨てる
  useEffect(() => () => recording.current?.cancel(), []);

  if (!canRecord()) return null;

  async function start() {
    haptic();
    latest.current = 0;
    setLevels(Array(BARS).fill(0));
    setSeconds(0);
    try {
      recording.current = await startRecording((l) => (latest.current = l));
      setPhase({ kind: 'recording' });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      toast(denied ? 'マイクが使えません。設定でマイクを許可してください' : 'マイクを使えませんでした', { error: true });
    }
  }

  async function stop() {
    const rec = recording.current;
    if (!rec) return;
    recording.current = null;
    haptic();
    setPhase({ kind: 'thinking' });
    try {
      const wav = await rec.stop();
      const result = await api.voice(wav);
      setPhase({ kind: 'confirm', result });
    } catch (e) {
      toast(errorText(e, '聞き取れませんでした。もう一度お試しください'), { error: true });
      setPhase({ kind: 'idle' });
    }
  }

  function cancel() {
    recording.current?.cancel();
    recording.current = null;
    setPhase({ kind: 'idle' });
  }

  const active = phase.kind === 'recording';
  return (
    <>
      <button
        type="button"
        className={clsx('voice-btn btn size-12 shrink-0 px-0', active && 'border-transparent bg-brand-soft-2 text-brand')}
        aria-label={active ? '音声入力を止める' : '音声で入力'}
        aria-pressed={active}
        onClick={() => void (active ? stop() : phase.kind === 'idle' ? start() : undefined)}
      >
        <Mic className="size-5" />
      </button>
      {(phase.kind === 'recording' || phase.kind === 'thinking') &&
        createPortal(<Listening thinking={phase.kind === 'thinking'} levels={levels} seconds={seconds} onStop={() => void stop()} onCancel={cancel} />, document.body)}
      {phase.kind === 'confirm' && <VoiceConfirm result={phase.result} onClose={() => setPhase({ kind: 'idle' })} onRetry={() => void start()} />}
    </>
  );
}

/** 録音中・整理中の画面。声の大きさに合わせて波線と丸が動くので、拾えているかが目で分かる */
function Listening({ thinking, levels, seconds, onStop, onCancel }: { thinking: boolean; levels: number[]; seconds: number; onStop: () => void; onCancel: () => void }) {
  const now = levels[levels.length - 1] ?? 0;
  const left = MAX_RECORD_SECONDS - seconds;
  return (
    <div className="voice-listening fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={thinking ? '整理しています' : '聞いています'}>
      <div className="rounded-t-3xl border-t border-line bg-surface px-6 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] text-center shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="w-10" />
          <p className="text-base font-semibold">{thinking ? '整理しています…' : '聞いています…'}</p>
          {thinking ? (
            <span className="w-10" />
          ) : (
            <button type="button" className="icon-btn" aria-label="やめる" onClick={onCancel}>
              <X className="size-5" />
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-3">{thinking ? '話した内容から、メモの下書きを作っています' : '欲しいもの・お店・値段などを話して、終わったら止めてください'}</p>

        {/* 声の大きさの波線（右から新しい音が流れてくる） */}
        <div className="voice-wave mx-auto mt-6 flex h-20 max-w-sm items-center justify-center gap-[3px]" aria-hidden="true">
          {levels.map((l, i) => (
            <span
              key={i}
              className={clsx('w-1.5 rounded-full transition-[height] duration-75', thinking ? 'animate-pulse bg-ink-3/40' : 'bg-brand')}
              style={{ height: `${thinking ? 12 : Math.max(6, l * 80)}px`, opacity: thinking ? 1 : 0.35 + (i / BARS) * 0.65 }}
            />
          ))}
        </div>

        {/* 止めるボタン。周りの光が声の大きさで広がる */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="relative flex size-24 items-center justify-center">
            {!thinking && (
              <span
                className="absolute inset-0 rounded-full bg-brand/25 blur-md transition-transform duration-100"
                style={{ transform: `scale(${1 + now * 0.6})` }}
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              className="relative flex size-20 items-center justify-center rounded-full bg-brand-strong text-white shadow-lg disabled:opacity-60"
              aria-label="止めて下書きを作る"
              disabled={thinking}
              onClick={onStop}
            >
              {thinking ? <Loader2 className="size-8 animate-spin" /> : <Square className="size-7 fill-current" />}
            </button>
          </div>
          {!thinking && <p className="amount text-sm text-ink-3">{`0:${String(seconds).padStart(2, '0')}`}{left <= 10 && `（あと${left}秒）`}</p>}
        </div>
      </div>
    </div>
  );
}

interface DraftState extends VoiceDraft {
  key: string;
  /** 値段は入力中の数字の文字列（空なら値段なし） */
  priceText: string;
}

/** 「以下を登録します」：聞き取った下書きを並べ、まとめて直してから登録する */
function VoiceConfirm({ result, onClose, onRetry }: { result: VoiceResponse; onClose: () => void; onRetry: () => void }) {
  const { categoryMap, upsertMemo } = useAppData();
  const toast = useToast();
  const [drafts, setDrafts] = useState<DraftState[]>(() =>
    result.items.map((d, i) => ({ ...d, key: `d${i}`, priceText: d.price === null ? '' : String(d.price) })),
  );
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<DraftState>) => setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const pickingDraft = drafts.find((d) => d.key === picking);

  async function save() {
    setError(null);
    if (drafts.some((d) => !d.title.trim())) return setError('名前が空のものがあります');
    setBusy(true);
    const failed: DraftState[] = [];
    for (const d of drafts) {
      // 消された大カテゴリ・中カテゴリは外して送る
      const cat = d.categoryId ? categoryMap.get(d.categoryId) : undefined;
      try {
        const saved = await api.createMemo({
          title: d.title.trim().slice(0, 100),
          categoryId: cat?.id ?? null,
          subcategoryId: cat?.subcategories.some((s) => s.id === d.subcategoryId) ? d.subcategoryId : null,
          price: d.priceText === '' ? null : Number(d.priceText),
          body: d.body.trim(),
          clientId: crypto.randomUUID().replace(/-/g, ''),
        });
        upsertMemo(saved);
      } catch (e) {
        failed.push(d);
        setError(errorText(e, '登録できなかったものがあります'));
      }
    }
    setBusy(false);
    const done = drafts.length - failed.length;
    if (done > 0) {
      oruReact('added');
      toast(`${done}件追加しました`);
    }
    if (failed.length === 0) onClose();
    else setDrafts(failed); // 登録できなかったものだけ残して、もう一度送れるようにする
  }

  const close = () => {
    if (!busy && (drafts.length === 0 || window.confirm('下書きを登録せずに閉じますか？'))) onClose();
  };

  return (
    <Sheet title="以下を登録します" onClose={close} tall>
      <div className="voice-confirm space-y-4">
        {result.mode === 'mock' && (
          <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn-ink">お試し版です（音声入力の AI がまだ設定されていません）。決まったサンプルを出しています</p>
        )}
        {result.transcript && (
          <p className="voice-transcript rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-3">
            <span className="font-semibold">聞き取った内容：</span>
            {result.transcript}
          </p>
        )}

        {drafts.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-ink-2">買いたいものが聞き取れませんでした</p>
            <button
              type="button"
              className="btn btn-sm mt-3"
              onClick={() => {
                onClose();
                onRetry();
              }}
            >
              <Mic className="size-4" />
              もう一度話す
            </button>
          </div>
        ) : (
          drafts.map((d, i) => {
            const cat = d.categoryId ? categoryMap.get(d.categoryId) : undefined;
            const sub = cat?.subcategories.find((s) => s.id === d.subcategoryId);
            return (
              <div key={d.key} className="voice-draft memo-card space-y-2.5 p-3">
                <div className="flex items-center gap-2">
                  <input
                    className="input min-h-10 flex-1 font-medium"
                    aria-label={`${i + 1}件目の名前`}
                    value={d.title}
                    maxLength={100}
                    onChange={(e) => update(d.key, { title: e.target.value })}
                  />
                  <button type="button" className="icon-btn size-10 text-ink-3 hover:text-danger" aria-label={`${i + 1}件目を外す`} onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="chip min-h-9 shrink-0 px-2 text-[13px]"
                    aria-label={`${i + 1}件目のカテゴリ：${cat ? `${cat.name}${sub ? ` › ${sub.name}` : ''}` : 'なし'}（押して選ぶ）`}
                    onClick={() => setPicking(d.key)}
                  >
                    {cat ? <CategoryBadge category={cat} subcategoryName={sub?.name} /> : <span className="px-1">カテゴリ</span>}
                    <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                  </button>
                  <div className="w-32">
                    <PriceInput value={d.priceText} onChange={(v) => update(d.key, { priceText: v })} ariaLabel={`${i + 1}件目の値段`} className="input min-h-9 py-1 text-right text-sm" />
                  </div>
                </div>
                <textarea
                  className="input min-h-10 py-2 text-sm leading-relaxed"
                  rows={d.body ? 2 : 1}
                  maxLength={5000}
                  placeholder="詳細メモ（任意）"
                  aria-label={`${i + 1}件目の詳細メモ`}
                  value={d.body}
                  onChange={(e) => update(d.key, { body: e.target.value })}
                />
              </div>
            );
          })
        )}

        {error && <p className="rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        {drafts.length > 0 && (
          <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void save()}>
            {busy ? '登録中…' : `${drafts.length}件を追加する`}
          </button>
        )}
      </div>
      {pickingDraft && (
        <CategoryPickerSheet
          categoryId={pickingDraft.categoryId}
          subcategoryId={pickingDraft.subcategoryId}
          onChange={(categoryId, subcategoryId) => update(pickingDraft.key, { categoryId, subcategoryId })}
          onClose={() => setPicking(null)}
        />
      )}
    </Sheet>
  );
}
