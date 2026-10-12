import clsx from 'clsx';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Tag, TagKind } from '../../shared/types';
import { api, errorText } from '../api';
import { Sheet } from '../components/Sheet';
import { KIND_LABEL, TagDeleteSheet, TagEditor, useTagUsage } from '../components/TagEditor';
import { TagIcon } from '../components/TagIcon';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';
import { restingRect, useFlip } from '../lib/flip';
import { haptic } from '../lib/haptics';

/**
 * 購入先・ジャンルの管理（Kakeibo の CategoryManager と同じ作り）。
 * 上の切り替えで購入先・ジャンルを選び、つまみのドラッグ（キーボードは ↑↓）で並べ替え、行ごとに編集・削除する
 */
export function TagManager({ onClose, initialKind = 'store' }: { onClose: () => void; initialKind?: TagKind }) {
  const { stores, genres, reload } = useAppData();
  const toast = useToast();
  const [kind, setKind] = useState<TagKind>(initialKind);
  const [editing, setEditing] = useState<Tag | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usage = useTagUsage(kind);
  const saved = kind === 'store' ? stores : genres;
  const label = KIND_LABEL[kind];
  /** ドラッグ中の並び（ID の配列）。ドラッグしていなければ null */
  const [order, setOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  /** つまみを持ってから、順番が1回でも入れ替わったか（置いたときに震わせるか） */
  const moved = useRef(false);
  const list = order ? order.map((id) => saved.find((t) => t.id === id)!).filter(Boolean) : saved;
  // 入れ替わった行が、前の位置からすっと動くようにする
  useFlip(rowRefs, list.map((x) => x.id).join());
  // 保存後、読み直した並びが手元の並びと一致したら（または保存に失敗したら）手元の並びをやめる。表示が一瞬戻るのを防ぐ
  const savedKey = saved.map((t) => t.id).join();
  useEffect(() => {
    if (!order || draggingId) return;
    if (order.join() === savedKey || error) setOrder(null);
  }, [savedKey, order, draggingId, error]);
  // 切り替えたら、前の種類のドラッグの途中の状態を捨てる
  useEffect(() => {
    setOrder(null);
    setDraggingId(null);
    setError(null);
  }, [kind]);

  async function commitOrder(ids: string[]) {
    if (ids.join() === savedKey) return;
    setError(null);
    try {
      await api.reorderTags(kind, ids);
      await reload();
      toast('並び順を変更しました');
    } catch (e) {
      setError(errorText(e, '保存に失敗しました'));
      await reload();
    }
  }

  // つまみを押してドラッグ：指の位置に合わせて行を入れ替え、離したときに保存する
  function onGripDown(e: PointerEvent<HTMLButtonElement>, id: string) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(id);
    moved.current = false;
    haptic();
    setOrder(saved.map((t) => t.id));
  }

  function onGripMove(e: PointerEvent<HTMLButtonElement>) {
    if (!draggingId || !order) return;
    const others = order.filter((id) => id !== draggingId);
    // 指の位置より上にある行（中心で判定）の数が、新しい位置になる
    let index = 0;
    for (const id of others) {
      const el = rowRefs.current.get(id);
      const rect = el && restingRect(el);
      if (rect && e.clientY > rect.top + rect.height / 2) index++;
    }
    const next = [...others.slice(0, index), draggingId, ...others.slice(index)];
    if (next.join() !== order.join()) {
      setOrder(next);
      moved.current = true;
      // 順番が入れ替わったことを、指に軽い振動で伝える（Android。iPhone は指を動かしている間は震わせられない）
      haptic();
    }
  }

  function onGripUp(e?: PointerEvent<HTMLButtonElement>) {
    if (order) void commitOrder(order);
    setDraggingId(null);
    // 置いたときに1回震わせる。iPhone は指を離した瞬間（touchend）でないと震わせられないので、指のときはそちらで行う
    if (moved.current && e?.pointerType !== 'touch') haptic();
  }
  function onGripTouchEnd() {
    if (moved.current) haptic();
    moved.current = false;
  }

  // キーボードでは、つまみにフォーカスして ↑↓ で1つずつ動かす
  function onGripKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!delta || index + delta < 0 || index + delta >= saved.length) return;
    e.preventDefault();
    const ids = saved.map((t) => t.id);
    const [one] = ids.splice(index, 1);
    ids.splice(index + delta, 0, one!);
    void commitOrder(ids);
  }

  return (
    <>
      <Sheet title="購入先・ジャンル" onClose={onClose}>
        <div className="segmented mb-4" role="group" aria-label="種類">
          <button type="button" aria-pressed={kind === 'store'} onClick={() => setKind('store')}>
            購入先
          </button>
          <button type="button" aria-pressed={kind === 'genre'} onClick={() => setKind('genre')}>
            ジャンル
          </button>
        </div>
        <p className="mx-1 mb-3 text-xs text-ink-3">
          {kind === 'store' ? 'どこで買うか。1つのメモにいくつでも付けられます。' : 'どういうものか。1つのメモに1つ付けられます。'}並び順は一覧の見出しの順になります。
        </p>
        {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        <div className="card overflow-hidden">
          {list.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-3">{label}がありません。下の「{label}を追加」から作成してください。</p>
          ) : (
            <ul className="divide">
              {list.map((t, i) => (
                <li
                  key={t.id}
                  ref={(el) => void (el ? rowRefs.current.set(t.id, el) : rowRefs.current.delete(t.id))}
                  className={clsx('flex items-center gap-1 py-2 pr-2 pl-1', draggingId === t.id && 'drag-lifted relative z-10 bg-brand-soft shadow-float')}
                >
                  <button
                    type="button"
                    className="icon-btn size-9 cursor-grab touch-none active:cursor-grabbing"
                    aria-label={`${t.name}の並び順を変える（ドラッグ、または↑↓キー）`}
                    onPointerDown={(e) => onGripDown(e, t.id)}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={() => onGripUp()}
                    onTouchEnd={onGripTouchEnd}
                    onKeyDown={(e) => onGripKey(e, i)}
                  >
                    <GripVertical className="size-4" />
                  </button>
                  <TagIcon icon={t.icon} color={t.color} />
                  <span className="ml-2 min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.name}</span>
                    <span className="text-xs text-ink-3">{usage.get(t.id) ?? 0}件</span>
                  </span>
                  <button type="button" className="icon-btn size-9" aria-label={`${t.name}を編集`} onClick={() => setEditing(t)}>
                    <Pencil className="size-4" />
                  </button>
                  <button type="button" className="icon-btn size-9 hover:text-danger" aria-label={`${t.name}を削除`} onClick={() => setDeleting(t)}>
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="btn btn-soft mt-3 w-full" onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {label}を追加
        </button>
      </Sheet>
      {editing && <TagEditor kind={kind} tag={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && <TagDeleteSheet kind={kind} tag={deleting} usage={usage.get(deleting.id) ?? 0} onClose={() => setDeleting(null)} />}
    </>
  );
}
