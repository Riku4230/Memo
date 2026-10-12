import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Category, Memo, Subcategory, User } from '../shared/types';
import { api, ApiError, errorText, hasPendingWrites } from './api';
import { useToast } from './components/Toast';
import { haptic } from './lib/haptics';
import { oruReact } from './lib/oru';

export interface AppData {
  user: User;
  /** 利用者 ID → 名前（追加した人・買った人の表示用） */
  memberNames: Map<string, string>;
  categories: Category[];
  categoryMap: Map<string, Category>;
  /** 中カテゴリの ID → 中カテゴリ（どの大カテゴリの中のものかも） */
  subcategoryMap: Map<string, Subcategory & { categoryId: string }>;
  memos: Memo[];
  /** 最初の読み込みが終わったか */
  ready: boolean;
  loadError: string | null;
  /** サーバーから読み直す（ほかの人の変更を取り込む） */
  reload: () => Promise<void>;
  /** サーバーの「変わった番号」だけを聞き、前に読んだときから変わっていれば読み直す */
  checkForChanges: () => Promise<void>;
  /** サーバーの返事（保存後のメモ）を画面に反映する */
  upsertMemo: (memo: Memo) => void;
  /** 画面だけから外す（送信前に仮で出したメモを、失敗したときに外すなど） */
  removeLocal: (id: string) => void;
  /** 買ったを付ける・外す（先に画面に反映し、失敗したら戻す） */
  toggleDone: (memo: Memo, done: boolean) => void;
  /** 消す（数秒「元に戻す」を出す） */
  deleteMemo: (memo: Memo) => Promise<boolean>;
}

const DataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const v = useContext(DataContext);
  if (!v) throw new Error('DataContext がありません');
  return v;
}

/** お知らせに出すメモの名前。「元に戻す」と並べても iPhone の幅で1行に収まるよう、6文字で切る */
function shortTitle(title: string): string {
  const chars = [...title];
  return chars.length > 6 ? `${chars.slice(0, 6).join('')}…` : title;
}

/** 新しいものを前に、同じ ID は置き換える */
function upsert(list: Memo[], memo: Memo): Memo[] {
  const i = list.findIndex((m) => m.id === memo.id);
  if (i < 0) return [memo, ...list];
  const next = [...list];
  next[i] = memo;
  return next;
}

export function DataProvider({ user, members, children }: { user: User; members: { id: string; name: string }[]; children: ReactNode }) {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 読み込み中に画面で変えたメモ（読み込みの結果で、変えたばかりの内容を古い内容に戻さないため） */
  const touched = useRef(new Map<string, Memo | null>());
  /** 最後に読んだデータの「変わった番号」 */
  const revision = useRef<number | null>(null);
  const loading = useRef(false);

  const reload = useCallback(async () => {
    touched.current.clear();
    loading.current = true;
    try {
      const data = await api.data();
      revision.current = data.revision;
      setCategories(data.categories);
      // 読み込みの間に画面で変えたものは、そちらを優先する
      let list = data.memos;
      for (const [id, m] of touched.current) list = m ? upsert(list, m) : list.filter((x) => x.id !== id);
      // 送信中で仮に出しているメモ（tmp-）は、サーバーにまだないので残す
      setMemos((prev) => [...prev.filter((m) => m.id.startsWith('tmp-') && !touched.current.has(m.id)), ...list]);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e, '読み込めませんでした'));
    } finally {
      loading.current = false;
      setReady(true);
    }
  }, []);

  const checkForChanges = useCallback(async () => {
    // 見ていないとき・読み込み中・自分の変更を送っている途中は聞かない（送っている途中に読み直すと、画面が一瞬古い内容に戻るため）
    if (document.visibilityState !== 'visible' || loading.current || revision.current === null || hasPendingWrites()) return;
    let latest: number;
    try {
      latest = (await api.revision()).revision;
    } catch {
      return; // 確認だけなので、つながらないときは黙って次を待つ
    }
    if (latest !== revision.current && !loading.current && !hasPendingWrites()) await reload();
  }, [reload]);

  useEffect(() => {
    void reload();
    // アプリに戻ってきたとき・つながり直したときに、相手の変更がないか確かめる
    const onVisible = () => void checkForChanges();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [reload, checkForChanges]);

  const upsertMemo = useCallback((memo: Memo) => {
    touched.current.set(memo.id, memo);
    setMemos((list) => upsert(list, memo));
  }, []);

  const removeLocal = useCallback((id: string) => {
    touched.current.set(id, null);
    setMemos((list) => list.filter((m) => m.id !== id));
  }, []);

  const toggleDone = useCallback(
    (memo: Memo, done: boolean) => {
      haptic();
      const optimistic: Memo = { ...memo, doneAt: done ? new Date().toISOString() : null, doneBy: done ? user.id : null };
      upsertMemo(optimistic);
      if (done) oruReact('done');
      api.setDone(memo.id, done).then(
        (saved) => {
          upsertMemo(saved);
          toast(done ? `「${shortTitle(memo.title)}」を買いました` : '欲しいものに戻しました', {
            action: { label: '元に戻す', onClick: () => toggleDone(saved, !done) },
          });
        },
        (e) => {
          upsertMemo(memo);
          toast(errorText(e, '保存できませんでした'), { error: true });
        },
      );
    },
    [toast, upsertMemo, user.id],
  );

  const deleteMemo = useCallback(
    async (memo: Memo) => {
      try {
        await api.deleteMemo(memo.id);
      } catch (e) {
        toast(errorText(e, '消せませんでした'), { error: true });
        if (e instanceof ApiError && e.status === 404) removeLocal(memo.id);
        return false;
      }
      removeLocal(memo.id);
      toast(`「${shortTitle(memo.title)}」を消しました`, {
        action: {
          label: '元に戻す',
          onClick: () =>
            void api.restoreMemo(memo.id).then(upsertMemo, (e) => toast(errorText(e, '元に戻せませんでした'), { error: true })),
        },
      });
      return true;
    },
    [removeLocal, toast, upsertMemo],
  );

  const value = useMemo<AppData>(
    () => ({
      user,
      memberNames: new Map(members.map((m) => [m.id, m.name])),
      categories,
      categoryMap: new Map(categories.map((c) => [c.id, c])),
      subcategoryMap: new Map(categories.flatMap((c) => c.subcategories.map((s) => [s.id, { ...s, categoryId: c.id }] as const))),
      memos,
      ready,
      loadError,
      reload,
      checkForChanges,
      upsertMemo,
      removeLocal,
      toggleDone,
      deleteMemo,
    }),
    [user, members, categories, memos, ready, loadError, reload, checkForChanges, upsertMemo, removeLocal, toggleDone, deleteMemo],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
