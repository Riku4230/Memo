/** 大カテゴリに設定できるアイコンのキー。画面側で lucide のアイコンに対応づける（Kakeibo の一覧に、お店・家電・家具などを足したもの） */
export const TAG_ICON_KEYS = [
  'store', 'shopping-bag', 'shopping-basket', 'package', 'truck', 'globe', 'tv', 'washing-machine', 'refrigerator',
  'laptop', 'smartphone', 'camera', 'lightbulb', 'sofa', 'lamp', 'bed', 'house', 'bath', 'sparkles', 'pill', 'utensils',
  'coffee', 'shirt', 'scissors', 'baby', 'dog', 'book', 'gamepad', 'music', 'dumbbell', 'gift', 'plane', 'car', 'heart',
] as const;
export type TagIconKey = (typeof TAG_ICON_KEYS)[number];
