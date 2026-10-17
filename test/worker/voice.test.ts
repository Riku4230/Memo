import { env, SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import type { Category } from '../../src/shared/types';
import { VOICE_DAILY_LIMIT, VOICE_MAX_BYTES } from '../../src/worker/routes/voice';
import { geminiVoiceAnalyzer, MAX_DRAFTS, normalizeVoiceOutput, VoiceAnalysisError } from '../../src/worker/services/voice';
import { categoryId, createUser, ORIGIN, subcategoryId, type TestUser } from './helpers';

/** 音声として送る中身（中身は見ないので、大きさだけ本物らしくする） */
function audio(bytes = 4000): Uint8Array {
  return new Uint8Array(bytes).fill(1);
}

async function postVoice(user: TestUser | null, body: Uint8Array, type = 'audio/wav') {
  const headers: Record<string, string> = { origin: ORIGIN, 'content-type': type };
  if (user) headers.cookie = user.cookie;
  const res = await SELF.fetch(`${ORIGIN}/api/voice`, { method: 'POST', headers, body });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

describe('音声入力', () => {
  it('ログインしていないと使えない', async () => {
    expect((await postVoice(null, audio())).status).toBe(401);
  });

  it('API キーがない間はお試し版で、今あるカテゴリに合わせた下書きを返す（登録はしない）', async () => {
    const user = await createUser();
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM memos').first<{ n: number }>();
    const res = await postVoice(user, audio());
    expect(res.status).toBe(200);
    expect(res.json.mode).toBe('mock');
    expect(res.json.transcript).toContain('お試し');
    expect(res.json.items).toEqual([
      { title: '洗剤', price: null, categoryId: await categoryId('日用品'), subcategoryId: null, body: '' },
      { title: '単3電池', price: 330, categoryId: await categoryId('100均'), subcategoryId: await subcategoryId('100均', 'ダイソー'), body: '4本入り' },
    ]);
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM memos').first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });

  it('WAV 以外・短すぎる・大きすぎる音声は断る', async () => {
    const user = await createUser();
    expect((await postVoice(user, audio(), 'audio/webm')).status).toBe(415);
    expect((await postVoice(user, audio(10))).status).toBe(400);
    expect((await postVoice(user, audio(VOICE_MAX_BYTES + 1))).status).toBe(413);
  });

  it('1人1日の回数を超えると断る', async () => {
    const user = await createUser();
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    await env.DB.prepare('INSERT INTO voice_usage (user_id, day, count) VALUES (?, ?, ?)').bind(user.id, today, VOICE_DAILY_LIMIT).run();
    const res = await postVoice(user, audio());
    expect(res.status).toBe(429);
    expect(res.json.error.code).toBe('voice_limit');
  });
});

const categories: Category[] = [
  { id: 'food', name: '食品', icon: 'store', color: '#000000', sortOrder: 0, subcategories: [{ id: 'costco', name: 'コストコ', sortOrder: 0 }] },
  { id: 'daily', name: '日用品', icon: 'store', color: '#000000', sortOrder: 1, subcategories: [] },
];

describe('Gemini の出力を整える', () => {
  it('カテゴリは名前から ID にし、ない名前・合わない中カテゴリ・おかしな値段は外す。名前が空の行は捨てる', () => {
    const out = normalizeVoiceOutput(
      {
        transcript: ' コストコで肉と、牛乳と、洗剤 ',
        items: [
          { title: ' 肉 ', price: 1980, category: '食品', subcategory: 'ｺｽﾄｺ', body: '1kg' },
          { title: '牛乳', price: -5, category: '食品', subcategory: 'スーパー', body: '' },
          { title: '洗剤', price: 1.5, category: '家電', subcategory: 'コストコ', body: '' },
          { title: '  ', price: null, category: '', subcategory: '', body: '' },
        ],
      },
      categories,
    );
    expect(out.transcript).toBe('コストコで肉と、牛乳と、洗剤');
    expect(out.items).toEqual([
      { title: '肉', price: 1980, categoryId: 'food', subcategoryId: 'costco', body: '1kg' },
      { title: '牛乳', price: null, categoryId: 'food', subcategoryId: null, body: '' },
      { title: '洗剤', price: null, categoryId: null, subcategoryId: null, body: '' },
    ]);
  });

  it(`下書きは${MAX_DRAFTS}件まで`, () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ title: `品${i}`, price: null, category: '', subcategory: '', body: '' }));
    expect(normalizeVoiceOutput({ transcript: '', items }, categories).items).toHaveLength(MAX_DRAFTS);
  });
});

describe('Gemini の呼び出し', () => {
  const reply = (payload: unknown, init: ResponseInit = { status: 200 }) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), init);

  it('音声とカテゴリの一覧を送り、結果を整えて返す', async () => {
    const fetcher = vi.fn(async () => reply({ transcript: 'コストコで肉', items: [{ title: '肉', price: null, category: '食品', subcategory: 'コストコ', body: '' }] }));
    const out = await geminiVoiceAnalyzer('test-key', 'gemini-test', fetcher as unknown as typeof fetch).analyze(new Uint8Array([1, 2, 3]).buffer, 'audio/wav', categories);
    expect(out.items).toEqual([{ title: '肉', price: null, categoryId: 'food', subcategoryId: 'costco', body: '' }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const sent = JSON.parse(init.body as string);
    expect(sent.contents[0].parts[0].inlineData).toEqual({ mimeType: 'audio/wav', data: 'AQID' });
    expect(sent.contents[0].parts[1].text).toContain('食品（中カテゴリ: コストコ）');
  });

  it('混雑・キーの誤り・時間切れは、利用者に見せられるメッセージで失敗する', async () => {
    const call = (fetcher: unknown) => geminiVoiceAnalyzer('k', 'm', fetcher as typeof fetch).analyze(new ArrayBuffer(8), 'audio/wav', categories);
    await expect(call(async () => new Response('{}', { status: 429 }))).rejects.toThrow('混み合っています');
    await expect(call(async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }))).rejects.toThrow('API キー');
    const timeout = async () => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    };
    await expect(call(timeout)).rejects.toThrow('時間がかかりすぎました');
    await expect(call(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })))).rejects.toThrow(VoiceAnalysisError);
  });
});
