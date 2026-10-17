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
import { MemoForm } from './MemoForm';

/** 送り直しで二重登録しないための、端末で作る ID */
function newClientId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

interface Picked {
  categoryId: string | null;
  subcategoryId: string | null;
}

/** 何も選んでいないカテゴリ（一覧を絞り込んでいるときは、その絞り込みに合うカテゴリ） */
function blank(preset: Picked): Picked {
  return { ...preset };
}

interface Props {
  /** 一覧の絞り込みに合うカテゴリ（初めから選んだ状態にし、登録したらこれに戻す） */
  preset: Picked;
  /** スマホは画面の下に固定（親指が届く位置）、PC は一覧の上 */
  docked: boolean;
  style?: CSSProperties;
}

/**
 * すぐ登録の入力欄。名前を書いて「追加」で登録できる。カテゴリは任意で、登録したら選び直しにする
 * （一覧を絞り込んでいるときは、その絞り込みに合うカテゴリに戻す）。
 * 登録は画面に先に出し、裏で送る（失敗したら外して、書いた名前を入力欄に戻す）
 */
export function QuickAdd({ preset, docked, style }: Props) {
  const { user, categoryMap, upsertMemo, removeLocal } = useAppData();
  const toast = useToast();
  const [title, setTitle] = useState('');
  /** 次に登録するメモのカテゴリ */
  const [last, setLast] = useState<Picked>(() => blank(preset));
  const [picker, setPicker] = useState(false);
  const [detail, setDetail] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 一覧の絞り込みを変えたら、それに合うカテゴリを選んだ状態にする（絞り込みをやめたら「なし」に戻す）
  const { categoryId: presetCategoryId, subcategoryId: presetSubcategoryId } = preset;
  useEffect(() => {
    setLast({ categoryId: presetCategoryId, subcategoryId: presetSubcategoryId });
  }, [presetCategoryId, presetSubcategoryId]);

  // PC では開いたらすぐ書けるようにする（iPhone は押すまでキーボードを出せないので、何もしない）
  useEffect(() => {
    if (!docked && window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
  }, [docked]);

  // 消された大カテゴリ・中カテゴリは外して使う
  const category = last.categoryId ? categoryMap.get(last.categoryId) : undefined;
  const sub = category?.subcategories.find((s) => s.id === last.subcategoryId);
  const categoryId = category?.id ?? null;
  const subcategoryId = sub?.id ?? null;


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
      price: null,
      links: [],
      doneAt: null,
      doneBy: null,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };
    haptic();
    setTitle('');
    // 登録したらカテゴリも選び直しにする
    setLast(blank(preset));
    upsertMemo(temp);
    oruReact('added');
    try {
      const saved = await api.createMemo({ title: name, categoryId, subcategoryId, clientId });
      removeLocal(temp.id);
      upsertMemo(saved);
    } catch (e) {
      removeLocal(temp.id);
      // 送れなかったら、書いた名前と選んだカテゴリを入力欄に戻す（その間に書き始めた・選び直したものはそのまま）
      setTitle((t) => t || name);
      setLast((cur) => (cur.categoryId === preset.categoryId && cur.subcategoryId === preset.subcategoryId ? { categoryId, subcategoryId } : cur));
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
          onChange={(c, sc) => setLast({ categoryId: c, subcategoryId: sc })}
          onClose={() => setPicker(false)}
        />
      )}
      {detail && (
        <MemoForm
          initial={{ title, categoryId, subcategoryId }}
          onClose={() => setDetail(false)}
          onSaved={() => {
            setTitle('');
            setLast(blank(preset));
            oruReact('added');
          }}
        />
      )}
    </>
  );
}
