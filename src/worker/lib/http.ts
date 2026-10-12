// Kakeibo の src/worker/lib/http.ts から（Kakeibo 側で直したら合わせる）
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';

export function fail(status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 502 | 503, code: string, message: string): never {
  throw new HTTPException(status, {
    res: new Response(JSON.stringify({ error: { code, message } }), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
  });
}

export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    fail(400, 'invalid_json', 'リクエストの形式が不正です');
  }
  const result = schema.safeParse(body);
  if (!result.success) fail(400, 'validation_error', '入力内容に誤りがあります');
  return result.data;
}

/** D1 の一意制約違反（同時操作で重複チェックをすり抜けた場合など） */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed|PRIMARY KEY/i.test(e.message);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? 'local';
}
