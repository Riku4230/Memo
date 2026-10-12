import clsx from 'clsx';
import type { Category } from '../../shared/types';
import { TagIcon } from './TagIcon';

/**
 * 「100均 › ダイソー」を Notion のタグのように見せる：角の丸みは小さく、大カテゴリの色を薄く塗る。
 * 色を文字に使うと薄い色が読みにくいので、文字は普通の色にし、色は塗りとアイコンに使う
 */
export function CategoryBadge({ category, subcategoryName, className }: { category: Category; subcategoryName?: string | null; className?: string }) {
  return (
    <span
      className={clsx('category-badge inline-flex max-w-full min-w-0 items-center gap-1 rounded-md py-0.5 pr-2 pl-1 text-xs font-medium text-ink', className)}
      style={{ backgroundColor: `${category.color}2e` }}
    >
      <TagIcon icon={category.icon} color={category.color} size="xs" plain className="size-4" />
      <span className="truncate">
        {category.name}
        {subcategoryName && <span className="text-ink-2"> › {subcategoryName}</span>}
      </span>
    </span>
  );
}
