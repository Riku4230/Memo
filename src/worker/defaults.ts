import type { TagIconKey } from '../shared/icons';

type DefaultCategory = { name: string; icon: TagIconKey; color: string; subcategories: string[] };

/** 初回セットアップで作る大カテゴリと中カテゴリ（あとで自由に変えられる。migrations/0002 の初期値と同じ） */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: '100均', icon: 'shopping-bag', color: '#4a3aa7', subcategories: ['ダイソー', 'セリア', 'キャンドゥ'] },
  { name: '日用品', icon: 'sparkles', color: '#1baf7a', subcategories: ['ドラッグストア'] },
  { name: '食品', icon: 'utensils', color: '#eb6834', subcategories: ['スーパー'] },
  { name: '家電', icon: 'tv', color: '#2a78d6', subcategories: ['ヨドバシ', 'ビックカメラ', 'Amazon'] },
  { name: '家具', icon: 'sofa', color: '#8b5cf6', subcategories: ['ニトリ', 'IKEA', '無印良品'] },
  { name: '服', icon: 'shirt', color: '#e87ba4', subcategories: [] },
  { name: 'その他', icon: 'package', color: '#8a8f98', subcategories: [] },
];
