import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { VoiceResponse } from '../../shared/types';
import type { AppEnv } from '../env';
import { fail } from '../lib/http';
import { voiceAnalyzer, VoiceAnalysisError } from '../services/voice';
import { listCategories } from './categories';

/** 音声の大きさの上限（画面で 16kHz・モノラルの WAV にして送る。60秒で約 1.9MB） */
export const VOICE_MAX_BYTES = 3 * 1024 * 1024;
/** 1人1日に使える回数（Gemini の料金が膨らまないように） */
export const VOICE_DAILY_LIMIT = 50;
const AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave'];

/** 日本時間の日付 */
function todayJst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const voice = new Hono<AppEnv>();

// 音声を受け取り、メモの下書きにして返す（登録はしない。確認画面で直してから、いつもの登録 API で送る）
voice.post(
  '/',
  bodyLimit({ maxSize: VOICE_MAX_BYTES, onError: () => fail(413, 'too_large', '録音が長すぎます。60秒以内で話してください') }),
  async (c) => {
    const type = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!AUDIO_TYPES.includes(type)) fail(415, 'unsupported_audio', 'この形式の音声は受け付けていません');
    const audio = await c.req.arrayBuffer();
    if (audio.byteLength < 1000) fail(400, 'empty_audio', '声が聞き取れませんでした。もう少し長めに話してください');

    // 1人1日の回数を数える（先に数えるので、失敗した分も1回に数える）
    const userId = c.get('userId');
    const row = await c.env.DB.prepare(
      'INSERT INTO voice_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1 RETURNING count',
    )
      .bind(userId, todayJst())
      .first<{ count: number }>();
    if ((row?.count ?? 0) > VOICE_DAILY_LIMIT) fail(429, 'voice_limit', `音声入力は1日${VOICE_DAILY_LIMIT}回までです。明日またお試しください`);

    const analyzer = voiceAnalyzer(c.env);
    try {
      const result = await analyzer.analyze(audio, 'audio/wav', await listCategories(c.env.DB));
      return c.json<VoiceResponse>({ mode: analyzer.mode, ...result });
    } catch (e) {
      if (e instanceof VoiceAnalysisError) fail(502, 'voice_failed', e.message);
      throw e;
    }
  },
);
