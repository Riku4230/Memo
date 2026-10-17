import { z } from 'zod';
import { MAX_PRICE } from '../../shared/schemas';
import type { Category, VoiceDraft, VoiceResponse } from '../../shared/types';
import type { Env } from '../env';

/**
 * 音声から「欲しいもの」のメモの下書きを作る。
 * GEMINI_API_KEY があれば Gemini（音声の聞き取りと整理を1回で行う）、なければ固定のサンプル結果を返すお試し版。
 * Gemini の呼び方は Kakeibo の receiptAnalyzer に合わせている（Kakeibo 側で直したら合わせる）
 */
export interface VoiceAnalyzer {
  mode: VoiceResponse['mode'];
  analyze(audio: ArrayBuffer, mimeType: string, categories: Category[]): Promise<Omit<VoiceResponse, 'mode'>>;
}

/** 利用者に見せられるメッセージ付きの失敗 */
export class VoiceAnalysisError extends Error {}

/** Kakeibo と同じモデル。変える場合は wrangler.jsonc の vars に GEMINI_MODEL を足す */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 30_000;
/** 1回で登録できる下書きの数 */
export const MAX_DRAFTS = 10;
const MAX_TITLE = 100;
const MAX_BODY = 500;

const PROMPT = `あなたは2人で使う「買いたいものメモ」アプリの入力係です。
添付の音声（日本語）を聞き取り、話に出てきた「買いたいもの」を1件ずつメモの下書きにしてください。

## 出力のきまり
- transcript: 聞き取った内容をそのまま（句読点を補ってよい）
- items: 買いたいもの1つにつき1件。話に買いたいものがなければ空の配列
  - title: 品物の名前だけを短く（例「食器用洗剤」「単3電池」）。お店・値段・数量・説明は入れない
  - price: 値段がはっきり言われたときだけ、円の整数。言われていなければ null
  - category: 下の「大カテゴリ」から一番合うものの名前をそのまま1つ。どうしても合うものがなければ空文字
  - subcategory: 選んだ大カテゴリの「中カテゴリ」に、話に出てきたお店や種類と合うものがあればその名前をそのまま。なければ空文字
  - body: 詳細メモ。サイズ・型番・色・数量・期限など、買うときに必要な情報だけを短く。なければ空文字。話の言い回しや感想は書かない

## 大カテゴリと中カテゴリ
\${CATEGORIES}`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          price: { type: 'INTEGER', nullable: true },
          category: { type: 'STRING' },
          subcategory: { type: 'STRING' },
          body: { type: 'STRING' },
        },
        required: ['title', 'price', 'category', 'subcategory', 'body'],
      },
    },
  },
  required: ['transcript', 'items'],
};

const geminiOutput = z.object({
  transcript: z.string().catch(''),
  items: z
    .array(
      z.object({
        title: z.string().catch(''),
        price: z.number().nullable().catch(null),
        category: z.string().catch(''),
        subcategory: z.string().catch(''),
        body: z.string().catch(''),
      }),
    )
    .catch([]),
});

function categoryList(categories: Category[]): string {
  if (!categories.length) return '（カテゴリはまだありません。category と subcategory は空文字にする）';
  return categories
    .map((c) => `- ${c.name}${c.subcategories.length ? `（中カテゴリ: ${c.subcategories.map((s) => s.name).join('、')}）` : ''}`)
    .join('\n');
}

/** 名前の比べ方（全角・半角や大文字・小文字の違いを気にしない） */
function key(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim();
}

/**
 * Gemini の出力を、今のメモと同じきまりに収める。
 * カテゴリは名前から ID に直し、今あるものだけを使う（ない名前・組み合わせの合わない中カテゴリは外す）
 */
export function normalizeVoiceOutput(raw: unknown, categories: Category[]): Omit<VoiceResponse, 'mode'> {
  const parsed = geminiOutput.safeParse(raw);
  if (!parsed.success) throw new VoiceAnalysisError('聞き取った内容を整理できませんでした。もう一度お試しください');
  const byName = new Map(categories.map((c) => [key(c.name), c]));
  const items: VoiceDraft[] = [];
  for (const it of parsed.data.items) {
    const title = it.title.trim().slice(0, MAX_TITLE);
    if (!title) continue;
    const category = byName.get(key(it.category));
    const sub = category?.subcategories.find((s) => key(s.name) === key(it.subcategory));
    const price = typeof it.price === 'number' && Number.isInteger(it.price) && it.price >= 0 && it.price <= MAX_PRICE ? it.price : null;
    items.push({ title, price, categoryId: category?.id ?? null, subcategoryId: sub?.id ?? null, body: it.body.trim().slice(0, MAX_BODY) });
    if (items.length >= MAX_DRAFTS) break;
  }
  return { transcript: parsed.data.transcript.trim().slice(0, 2000), items };
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function geminiVoiceAnalyzer(apiKey: string, model = DEFAULT_GEMINI_MODEL, fetcher: typeof fetch = fetch): VoiceAnalyzer {
  return {
    mode: 'ai',
    async analyze(audio, mimeType, categories) {
      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType, data: toBase64(audio) } }, { text: PROMPT.replace('${CATEGORIES}', categoryList(categories)) }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          // 聞き取りと整理に深い推論は不要。費用と待ち時間を抑える
          thinkingConfig: { thinkingLevel: 'MINIMAL' },
          maxOutputTokens: 4096,
        },
      };
      const started = Date.now();
      // Workers の fetch は、別のオブジェクトのメソッドとして呼ぶと「Illegal invocation」で失敗する。取り出してから呼ぶ
      const doFetch = fetcher;
      let res: Response;
      try {
        res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        // 音声や応答の中身はログに残さない
        const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
        console.error(`gemini voice ${timedOut ? 'timeout' : 'fetch failed'}: ms=${Date.now() - started}`);
        throw new VoiceAnalysisError(timedOut ? '聞き取りに時間がかかりすぎました。短めに話して、もう一度お試しください' : '音声入力のサービスにつながりませんでした。少し待ってからお試しください');
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null;
        console.error(`gemini voice error: status=${res.status} ${err?.error?.status ?? ''} ${(err?.error?.message ?? '').slice(0, 300)}`);
        const keyInvalid = /API key|API_KEY/i.test(err?.error?.message ?? '');
        throw new VoiceAnalysisError(
          res.status === 429
            ? '音声入力が混み合っています。少し待ってからお試しください'
            : keyInvalid
              ? '音声入力の設定（API キー）が無効です'
              : '聞き取りに失敗しました。もう一度お試しください',
        );
      }
      type GeminiResponse = {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      const meta = data.usageMetadata ?? {};
      console.log(`gemini voice ok: ms=${Date.now() - started} finish=${data.candidates?.[0]?.finishReason ?? '-'} in=${meta.promptTokenCount ?? 0} out=${meta.candidatesTokenCount ?? 0}`);
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new VoiceAnalysisError('聞き取った内容を整理できませんでした。もう一度お試しください');
      }
      return normalizeVoiceOutput(raw, categories);
    },
  };
}

/** API キー未設定の間のお試し版。今あるカテゴリの名前に合わせた、固定のサンプルを返す */
export const mockVoiceAnalyzer: VoiceAnalyzer = {
  mode: 'mock',
  async analyze(_audio, _mimeType, categories) {
    return normalizeVoiceOutput(
      {
        transcript: '（お試し）日用品で洗剤と、100均のダイソーで単3電池。電池は330円くらい。',
        items: [
          { title: '洗剤', price: null, category: '日用品', subcategory: '', body: '' },
          { title: '単3電池', price: 330, category: '100均', subcategory: 'ダイソー', body: '4本入り' },
        ],
      },
      categories,
    );
  },
};

export function voiceAnalyzer(env: Env): VoiceAnalyzer {
  return env.GEMINI_API_KEY ? geminiVoiceAnalyzer(env.GEMINI_API_KEY, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL) : mockVoiceAnalyzer;
}
