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

export type TagKind = 'store' | 'genre';

/** 購入先・ジャンル（作りは同じ） */
export interface Tag {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}

/** 候補（メモ × 購入先） */
export interface Offer {
  storeId: string;
  price: number | null;
  url: string;
  note: string;
  /** 値段を確かめた日（YYYY-MM-DD） */
  checkedOn: string | null;
}

export interface MemoLink {
  url: string;
  label: string;
}

export interface Memo {
  id: string;
  title: string;
  body: string;
  genreId: string | null;
  offers: Offer[];
  links: MemoLink[];
  doneAt: string | null;
  doneBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppDataResponse {
  stores: Tag[];
  genres: Tag[];
  memos: Memo[];
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
