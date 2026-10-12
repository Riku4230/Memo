import { z } from 'zod';
import { MAX_URL_LENGTH, isHttpUrl } from './url';

export const deviceName = z.string().trim().min(1).max(40);

const httpUrl = z.string().trim().max(MAX_URL_LENGTH).refine(isHttpUrl, 'http または https の URL を入力してください');

export const MAX_LINKS = 10;

export const linkInput = z.object({
  url: httpUrl,
  label: z.string().trim().max(100).default(''),
});

const id = z.string().min(1).max(64);

export const memoCreate = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().max(5000).default(''),
  categoryId: id.nullable().default(null),
  subcategoryId: id.nullable().default(null),
  links: z.array(linkInput).max(MAX_LINKS).default([]),
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
});
export type MemoCreateInput = z.input<typeof memoCreate>;

export const memoUpdate = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  body: z.string().max(5000).optional(),
  /** 大カテゴリと中カテゴリは組で送る（大カテゴリを変えたら中カテゴリも選び直すため） */
  categoryId: id.nullable().optional(),
  subcategoryId: id.nullable().optional(),
  links: z.array(linkInput).max(MAX_LINKS).optional(),
  /** 画面が読み込んだときの更新日時。サーバーの値と違えば、ほかの人が先に直している（409） */
  baseUpdatedAt: z.string().max(40).optional(),
});
export type MemoUpdateInput = z.input<typeof memoUpdate>;

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(20),
  icon: z.string().min(1).max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export const subcategoryName = z.object({ name: z.string().trim().min(1).max(20) });
