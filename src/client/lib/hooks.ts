// Kakeibo の src/client/lib/hooks.ts から（Kakeibo 側で直したら合わせる）
import { useCallback, useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

/**
 * 非同期でデータを読み込む。deps が変わるか reload() で再取得する。
 * deps（読み込む対象。例：表示中の月）が変わった直後は、前の対象の data を返さない（月を切り替えた直後に前の月の金額を出さない）。
 * refresh（同じ対象の再読み込みの合図）が変わったときは、読み込み中も前の data を表示し続ける。
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], refresh: unknown = 0) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; data: T | null; error: Error | null }>({ key, data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fn().then(
      (d) => !cancelled && setState({ key, data: d, error: null }),
      (e: Error) => !cancelled && setState({ key, data: null, error: e }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, refresh]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const fresh = state.key === key;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, loading: !fresh || (state.data === null && state.error === null), reload };
}

/**
 * 月ごとに「日付 → 値」を読み込み、変えたときはサーバーの返事を待たずに見た目へ反映する（日付の色）。
 * 読めなかったときは空として扱う。読み直したら（相手が変えた分も含めて）サーバーの値に戻す。
 * update は、保存に失敗したときに元へ戻す関数を返す
 */
export function useMonthMap<T>(load: (month: string) => Promise<Record<string, T>>, month: string, refresh: unknown) {
  const res = useAsync(() => load(month).catch(() => ({}) as Record<string, T>), [month], refresh);
  const [edits, setEdits] = useState<{ month: string; map: Record<string, T> } | null>(null);
  useEffect(() => setEdits(null), [res.data]);
  const map = edits?.month === month ? edits.map : (res.data ?? {});
  const update = useCallback(
    (date: string, value: T | null) => {
      const before = map;
      const next = { ...map };
      if (value === null) delete next[date];
      else next[date] = value;
      setEdits({ month, map: next });
      return () => setEdits({ month, map: before });
    },
    [map, month],
  );
  return [map, update] as const;
}
