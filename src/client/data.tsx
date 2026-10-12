import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Memo, Tag, User } from '../shared/types';
import { api, ApiError, errorText } from './api';
import { useToast } from './components/Toast';
import { haptic } from './lib/haptics';
import { oruReact } from './lib/oru';

export interface AppData {
  user: User;
  /** 利用者 ID → 名前（追加した人・買った人の表示用） */
  memberNames: Map<string, string>;
  stores: Tag[];
  genres: Tag[];
  storeMap: Map<string, Tag>;
  genreMap: Map<string, Tag>;
  memos: Memo[];
  /** 最初の読み込みが終わったか */
  ready: boolean;
  loadError: string | null;
  /** サーバーから読み直す（ほかの人の変更を取り込む） */
  reload: () => Promise<void>;
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
  const [stores, setStores] = useState<Tag[]>([]);
  const [genres, setGenres] = useState<Tag[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 読み込み中に画面で変えたメモ（読み込みの結果で、変えたばかりの内容を古い内容に戻さないため） */
  const touched = useRef(new Map<string, Memo | null>());

  const reload = useCallback(async () => {
    touched.current.clear();
    try {
      const data = await api.data();
      setStores(data.stores);
      setGenres(data.genres);
      // 読み込みの間に画面で変えたものは、そちらを優先する
      let list = data.memos;
      for (const [id, m] of touched.current) list = m ? upsert(list, m) : list.filter((x) => x.id !== id);
      setMemos(list);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e, '読み込めませんでした'));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    // ほかの人の変更を取り込むため、アプリに戻ってきたときに読み直す
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [reload]);

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
          toast(done ? `「${memo.title}」を買ったものにしました` : `「${memo.title}」を欲しいものに戻しました`, {
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
      toast(`「${memo.title}」を消しました`, {
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
      stores,
      genres,
      storeMap: new Map(stores.map((s) => [s.id, s])),
      genreMap: new Map(genres.map((g) => [g.id, g])),
      memos,
      ready,
      loadError,
      reload,
      upsertMemo,
      removeLocal,
      toggleDone,
      deleteMemo,
    }),
    [user, members, stores, genres, memos, ready, loadError, reload, upsertMemo, removeLocal, toggleDone, deleteMemo],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
