import type { TagIconKey } from '../shared/icons';

type DefaultTag = { name: string; icon: TagIconKey; color: string };

/** 初回セットアップで作る購入先（あとで自由に変えられる） */
export const DEFAULT_STORES: DefaultTag[] = [
  { name: 'ヨドバシ', icon: 'store', color: '#e34948' },
  { name: 'ビックカメラ', icon: 'store', color: '#eb6834' },
  { name: 'Amazon', icon: 'package', color: '#eda100' },
  { name: '楽天', icon: 'shopping-bag', color: '#d55181' },
  { name: '無印良品', icon: 'shopping-basket', color: '#8a8f98' },
  { name: 'IKEA', icon: 'sofa', color: '#2a78d6' },
  { name: 'ニトリ', icon: 'house', color: '#1baf7a' },
  { name: 'ドラッグストア', icon: 'pill', color: '#0e9fb5' },
  { name: 'スーパー', icon: 'shopping-basket', color: '#008300' },
];

/** 初回セットアップで作るジャンル */
export const DEFAULT_GENRES: DefaultTag[] = [
  { name: '家電', icon: 'tv', color: '#2a78d6' },
  { name: '洗濯機', icon: 'washing-machine', color: '#0e9fb5' },
  { name: '冷蔵庫', icon: 'refrigerator', color: '#4a3aa7' },
  { name: '日用品', icon: 'sparkles', color: '#1baf7a' },
  { name: '食品', icon: 'utensils', color: '#eb6834' },
  { name: '家具', icon: 'sofa', color: '#8b5cf6' },
  { name: '服', icon: 'shirt', color: '#e87ba4' },
  { name: 'その他', icon: 'package', color: '#8a8f98' },
];
