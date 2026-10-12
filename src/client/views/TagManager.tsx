import { ChevronDown, ChevronRight, ChevronUp, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Tag, TagKind } from '../../shared/types';
import { api, errorText } from '../api';
import { Sheet } from '../components/Sheet';
import { KIND_LABEL, TagEditor } from '../components/TagEditor';
import { TagIcon } from '../components/TagIcon';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';

/** 購入先・ジャンルの一覧。並べ替え（上下のボタン）・編集・追加 */
export function TagManager({ kind, onClose }: { kind: TagKind; onClose: () => void }) {
  const { stores, genres, reload } = useAppData();
  const toast = useToast();
  const list = kind === 'store' ? stores : genres;
  const [editing, setEditing] = useState<Tag | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  async function move(index: number, delta: -1 | 1) {
    const ids = list.map((t) => t.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    setBusy(true);
    try {
      await api.reorderTags(kind, ids);
      await reload();
    } catch (e) {
      toast(errorText(e, '並べ替えられませんでした'), { error: true });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={KIND_LABEL[kind]} onClose={onClose}>
      <p className="mb-3 text-sm text-ink-3">
        {kind === 'store' ? 'どこで買うか。1つのメモに、いくつでも付けられます。' : 'どういうものか。1つのメモに1つ付けられます。'}並びは一覧の見出しの順になります。
      </p>
      <div className="card divide overflow-hidden">
        {list.map((t, i) => (
          <div key={t.id} className="flex items-center">
            <button type="button" className="row-item min-w-0 flex-1 hover:bg-surface-2/60" onClick={() => setEditing(t)}>
              <TagIcon icon={t.icon} color={t.color} size="sm" />
              <span className="flex-1 truncate">{t.name}</span>
              <ChevronRight className="size-4 text-ink-3" />
            </button>
            <button type="button" className="icon-btn" aria-label={`${t.name}を上へ`} disabled={busy || i === 0} onClick={() => void move(i, -1)}>
              <ChevronUp className="size-4" />
            </button>
            <button type="button" className="icon-btn mr-1" aria-label={`${t.name}を下へ`} disabled={busy || i === list.length - 1} onClick={() => void move(i, 1)}>
              <ChevronDown className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className="row-item font-medium text-brand hover:bg-surface-2/60" onClick={() => setEditing('new')}>
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand-soft">
            <Plus className="size-4" />
          </span>
          {KIND_LABEL[kind]}を追加
        </button>
      </div>
      {editing && <TagEditor kind={kind} tag={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Sheet>
  );
}
