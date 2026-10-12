import clsx from 'clsx';
import { ChevronDown, NotebookPen, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Memo } from '../../shared/types';
import { api, errorText } from '../api';
import { CategoryBadge } from '../components/CategoryBadge';
import { CategoryPickerSheet } from '../components/CategoryPicker';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';
import { haptic } from '../lib/haptics';
import { oruReact } from '../lib/oru';
import { loadLastCategory, saveLastCategory, type LastCategory } from '../lib/prefs';
import { MemoForm } from './MemoForm';

/** 送り直しで二重登録しないための、端末で作る ID */
function newClientId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

interface Props {
  /** 一覧で絞り込んでいる大カテゴリ（その値を初めから選んだ状態にする） */
  filterCategoryId: string | null;
  /** スマホは画面の下に固定（親指が届く位置）、PC は一覧の上 */
  docked: boolean;
  style?: CSSProperties;
}

/**
 * すぐ登録の入力欄。名前を書いて「追加」で登録できる。カテゴリは任意で、前に選んだものを覚えておく。
 * 登録は画面に先に出し、裏で送る（失敗したら外して、書いた名前を入力欄に戻す）
 */
export function QuickAdd({ filterCategoryId, docked, style }: Props) {
  const { user, categoryMap, upsertMemo, removeLocal } = useAppData();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [last, setLast] = useState<LastCategory>(loadLastCategory);
  const [picker, setPicker] = useState(false);
  const [detail, setDetail] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 一覧を大カテゴリで絞り込んだら、その大カテゴリを選んだ状態にする
  useEffect(() => {
    if (filterCategoryId) setLast((t) => (t.categoryId === filterCategoryId ? t : { categoryId: filterCategoryId, subcategoryId: null }));
  }, [filterCategoryId]);

  // PC では開いたらすぐ書けるようにする（iPhone は押すまでキーボードを出せないので、何もしない）
  useEffect(() => {
    if (!docked && window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
  }, [docked]);

  // 消された大カテゴリ・中カテゴリは外して使う
  const category = last.categoryId ? categoryMap.get(last.categoryId) : undefined;
  const sub = category?.subcategories.find((s) => s.id === last.subcategoryId);
  const categoryId = category?.id ?? null;
  const subcategoryId = sub?.id ?? null;

  const update = (next: LastCategory) => {
    setLast(next);
    saveLastCategory(next);
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
      categoryId,
      subcategoryId,
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
      const saved = await api.createMemo({ title: name, categoryId, subcategoryId, clientId });
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
        <div className="scroll-x min-w-0 flex-1" role="group" aria-label="追加するメモのカテゴリ">
          <button type="button" className={clsx(chip, 'pl-1.5')} aria-label={`カテゴリ：${category ? `${category.name}${sub ? ` › ${sub.name}` : ''}` : 'なし'}（押して選ぶ）`} onClick={() => setPicker(true)}>
            {category ? <CategoryBadge category={category} subcategoryName={sub?.name} className="border-0 bg-transparent py-0 pl-0" /> : <span className="pl-1.5">カテゴリ</span>}
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
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
        <CategoryPickerSheet
          categoryId={categoryId}
          subcategoryId={subcategoryId}
          onChange={(c, sc) => update({ categoryId: c, subcategoryId: sc })}
          onClose={() => setPicker(false)}
        />
      )}
      {detail && (
        <MemoForm
          initial={{ title, categoryId, subcategoryId }}
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
