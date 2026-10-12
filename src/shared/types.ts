/** 画面と API で共有する型 */

export interface User {
  id: string;
  name: string;
  role: 'owner' | 'member';
  createdAt: string;
}

export interface Me {
  user: User | null;
  /** メモ帳を使っている人（追加した人・買った人の名前の表示に使う） */
  members: { id: string; name: string }[];
  setupRequired: boolean;
}

/** 中カテゴリ（大カテゴリの中の分け方。例: 100均 › ダイソー） */
export interface Subcategory {
  id: string;
  name: string;
  sortOrder: number;
}

/** 大カテゴリ（例: 100均・日用品・家電） */
export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  subcategories: Subcategory[];
}

export interface MemoLink {
  url: string;
  label: string;
}

export interface Memo {
  id: string;
  title: string;
  body: string;
  /** 大カテゴリ・中カテゴリ（どちらも任意。中カテゴリは大カテゴリの中のもの） */
  categoryId: string | null;
  subcategoryId: string | null;
  /** 値段（円・任意） */
  price: number | null;
  links: MemoLink[];
  doneAt: string | null;
  doneBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppDataResponse {
  categories: Category[];
  memos: Memo[];
  /** このデータを読んだときの「変わった番号」（/api/revision と比べて、変わっていたら読み直す） */
  revision: number;
}

export interface RevisionResponse {
  revision: number;
}

export interface PasskeyInfo {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface InviteInfo {
  id: string;
  note: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'used' | 'expired' | 'revoked';
  usedByName: string | null;
}

export interface MemberInfo {
  id: string;
  name: string;
  role: 'owner' | 'member';
  createdAt: string;
  lastSeenAt: string | null;
  memoCount: number;
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}
