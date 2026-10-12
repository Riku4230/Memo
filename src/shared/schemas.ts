import { z } from 'zod';
import { MAX_URL_LENGTH, isHttpUrl } from './url';

export const deviceName = z.string().trim().min(1).max(40);

const httpUrl = z.string().trim().max(MAX_URL_LENGTH).refine(isHttpUrl, 'http または https の URL を入力してください');
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MAX_OFFERS = 20;
export const MAX_LINKS = 10;
export const MAX_PRICE = 9_999_999;

export const offerInput = z.object({
  storeId: z.string().min(1).max(64),
  price: z.number().int().min(0).max(MAX_PRICE).nullable().default(null),
  url: z.union([z.literal(''), httpUrl]).default(''),
  note: z.string().trim().max(200).default(''),
  checkedOn: dateString.nullable().default(null),
});

export const linkInput = z.object({
  url: httpUrl,
  label: z.string().trim().max(100).default(''),
});

const offers = z
  .array(offerInput)
  .max(MAX_OFFERS)
  .refine((list) => new Set(list.map((o) => o.storeId)).size === list.length, '同じ購入先は1回だけ選べます');

export const memoCreate = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().max(5000).default(''),
  genreId: z.string().min(1).max(64).nullable().default(null),
  offers: offers.default([]),
  links: z.array(linkInput).max(MAX_LINKS).default([]),
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
});
export type MemoCreateInput = z.input<typeof memoCreate>;

export const memoUpdate = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  body: z.string().max(5000).optional(),
  genreId: z.string().min(1).max(64).nullable().optional(),
  offers: offers.optional(),
  links: z.array(linkInput).max(MAX_LINKS).optional(),
  /** 画面が読み込んだときの更新日時。サーバーの値と違えば、ほかの人が先に直している（409） */
  baseUpdatedAt: z.string().max(40).optional(),
});
export type MemoUpdateInput = z.input<typeof memoUpdate>;

export const tagInput = z.object({
  name: z.string().trim().min(1).max(20),
  icon: z.string().min(1).max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type TagInput = z.infer<typeof tagInput>;
