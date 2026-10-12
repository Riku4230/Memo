import clsx from 'clsx';
import { ChevronDown, NotebookPen, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Memo } from '../../shared/types';
import { api, errorText } from '../api';
import { TagIcon } from '../components/TagIcon';
import { TagPickerSheet } from '../components/TagPicker';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';
import { haptic } from '../lib/haptics';
import { oruReact } from '../lib/oru';
import { loadLastTags, saveLastTags, type LastTags } from '../lib/prefs';
import { MemoForm } from './MemoForm';

/** 送り直しで二重登録しないための、端末で作る ID */
function newClientId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

interface Props {
  /** 一覧で絞り込んでいる購入先・ジャンル（その値を初めから選んだ状態にする） */
  filterStoreId: string | null;
  filterGenreId: string | null;
  /** スマホは画面の下に固定（親指が届く位置）、PC は一覧の上 */
  docked: boolean;
  style?: CSSProperties;
}

/**
 * すぐ登録の入力欄。名前を書いて「追加」で登録できる。ジャンル・購入先は任意で、前に選んだものを覚えておく。
 * 登録は画面に先に出し、裏で送る（失敗したら外して、書いた名前を入力欄に戻す）
 */
export function QuickAdd({ filterStoreId, filterGenreId, docked, style }: Props) {
  const { user, storeMap, genreMap, upsertMemo, removeLocal } = useAppData();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<LastTags>(loadLastTags);
  const [picker, setPicker] = useState<'genre' | 'store' | null>(null);
  const [detail, setDetail] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 一覧を絞り込んだら、その購入先・ジャンルを選んだ状態にする
  useEffect(() => {
    if (filterGenreId) setTags((t) => ({ ...t, genreId: filterGenreId }));
  }, [filterGenreId]);
  useEffect(() => {
    if (filterStoreId) setTags((t) => ({ ...t, storeIds: [filterStoreId] }));
  }, [filterStoreId]);

  // PC では開いたらすぐ書けるようにする（iPhone は押すまでキーボードを出せないので、何もしない）
  useEffect(() => {
    if (!docked && window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
  }, [docked]);

  // 消された購入先・ジャンルは外して使う
  const genreId = tags.genreId && genreMap.has(tags.genreId) ? tags.genreId : null;
  const storeIds = tags.storeIds.filter((id) => storeMap.has(id));
  const genre = genreId ? genreMap.get(genreId) : undefined;
  const stores = storeIds.map((id) => storeMap.get(id)!);

  const update = (next: LastTags) => {
    setTags(next);
    saveLastTags(next);
  };

  async function submit() {
    const name = title.trim().slice(0, 100);
    if (!name) {
      inputRef.current?.focus();
      return;
    }
    const clientId = newClientId();
    const now = new Date().toISOString();
    const temp: Memo = {
      id: `tmp-${clientId}`,
      title: name,
      body: '',
      genreId,
      offers: storeIds.map((storeId) => ({ storeId, price: null, url: '', note: '', checkedOn: null })),
      links: [],
      doneAt: null,
      doneBy: null,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };
    haptic();
    setTitle('');
    upsertMemo(temp);
    oruReact('added');
    try {
      const saved = await api.createMemo({ title: name, genreId, offers: temp.offers, clientId });
      removeLocal(temp.id);
      upsertMemo(saved);
    } catch (e) {
      removeLocal(temp.id);
      setTitle((t) => t || name);
      toast(errorText(e, '追加できませんでした'), { error: true });
    }
  }

  const chip = 'chip shrink-0 min-h-8 px-3 text-[13px]';
  return (
    <>
      <form
        className={clsx(
          'quick-add',
          docked
            ? 'fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] backdrop-blur'
            : 'card p-3',
        )}
        style={style}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            ref={inputRef}
            className="input min-h-12 flex-1 text-[16px]"
            placeholder="欲しいものを書く"
            aria-label="欲しいもの"
            value={title}
            maxLength={100}
            enterKeyHint="done"
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="btn btn-primary min-h-12 px-4" aria-label="追加">
            <Plus className="size-5" />
            追加
          </button>
        </div>
        <div className="mx-auto mt-2 flex max-w-2xl items-center gap-2">
        <div className="scroll-x min-w-0 flex-1" role="group" aria-label="追加するメモのジャンルと購入先">
          <button type="button" className={chip} aria-pressed={!!genre} onClick={() => setPicker('genre')}>
            {genre ? <TagIcon icon={genre.icon} color={genre.color} size="xs" /> : null}
            {genre ? genre.name : 'ジャンル'}
            <ChevronDown className="size-3.5 opacity-60" />
          </button>
          <button type="button" className={chip} aria-pressed={stores.length > 0} onClick={() => setPicker('store')}>
            {stores[0] ? <TagIcon icon={stores[0].icon} color={stores[0].color} size="xs" /> : null}
            {stores.length === 0 ? '購入先' : stores.length === 1 ? stores[0]!.name : `${stores[0]!.name} +${stores.length - 1}`}
            <ChevronDown className="size-3.5 opacity-60" />
          </button>
        </div>
        {/* 狭い画面でも隠れないよう、横スクロールの外に置く */}
        <button type="button" className="btn btn-ghost btn-sm shrink-0 px-2 text-ink-3" onClick={() => setDetail(true)}>
          <NotebookPen className="size-4" />
          詳しく
        </button>
        </div>
      </form>
      {picker && (
        <TagPickerSheet
          kind={picker}
          multiple={picker === 'store'}
          value={picker === 'genre' ? (genreId ? [genreId] : []) : storeIds}
          onChange={(ids) => update(picker === 'genre' ? { genreId: ids[0] ?? null, storeIds } : { genreId, storeIds: ids })}
          onClose={() => setPicker(null)}
        />
      )}
      {detail && (
        <MemoForm
          initial={{ title, genreId, storeIds }}
          onClose={() => setDetail(false)}
          onSaved={() => {
            setTitle('');
            oruReact('added');
          }}
        />
      )}
    </>
  );
}
