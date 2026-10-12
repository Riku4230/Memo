import clsx from 'clsx';
import type { Category } from '../../shared/types';
import { TagIcon } from './TagIcon';

/**
 * 「100均 › ダイソー」を、大カテゴリの色の枠で囲んだ丸いラベルで見せる。
 * 色を文字に使うと薄い色が読みにくいので、文字は普通の色にし、色は枠・背景・アイコンに使う
 */
export function CategoryBadge({ category, subcategoryName, className }: { category: Category; subcategoryName?: string | null; className?: string }) {
  return (
    <span
      className={clsx('category-badge inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border py-0.5 pr-2.5 pl-1 text-xs font-medium text-ink-2', className)}
      style={{ borderColor: `${category.color}66`, backgroundColor: `${category.color}14` }}
    >
      <TagIcon icon={category.icon} color={category.color} size="xs" className="rounded-full" />
      <span className="truncate">
        {category.name}
        {subcategoryName && <span className="text-ink-3"> › {subcategoryName}</span>}
      </span>
    </span>
  );
}
