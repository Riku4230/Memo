import { Link2, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { MAX_LINKS } from '../../shared/schemas';
import type { Memo } from '../../shared/types';
import { extractUrl, isHttpUrl } from '../../shared/url';
import { api, ApiError, errorText } from '../api';
import { CategoryGrid, SubcategoryPicker } from '../components/CategoryPicker';
import { PriceInput } from '../components/PriceInput';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';

interface LinkDraft {
  url: string;
  label: string;
}

/** 入れた URL が使えなければ、その理由（空なら問題なし） */
export function urlProblem(url: string, required: boolean): string | null {
  const s = url.trim();
  if (!s) return required ? 'URL を入れてください' : null;
  return isHttpUrl(s) ? null : 'http:// か https:// で始まる URL を入れてください';
}

interface Props {
  /** 編集するメモ。新規なら undefined */
  memo?: Memo;
  /** 新規のときの初めの値（すぐ登録の入力欄から開いたとき） */
  initial?: { title: string; categoryId: string | null; subcategoryId: string | null };
  onClose: () => void;
  onSaved?: (memo: Memo) => void;
}

/** 全項目（名前・値段・大カテゴリ・中カテゴリ・詳細メモ・リンク）をまとめて書く・直すシート */
export function MemoForm({ memo, initial, onClose, onSaved }: Props) {
  const { categoryMap, upsertMemo, reload } = useAppData();
  const toast = useToast();
  const start = useRef({
    title: memo?.title ?? initial?.title ?? '',
    categoryId: memo?.categoryId ?? initial?.categoryId ?? null,
    subcategoryId: memo?.subcategoryId ?? initial?.subcategoryId ?? null,
    // 値段は数字の文字列（空なら値段なし）
    price: memo?.price != null ? String(memo.price) : '',
    body: memo?.body ?? '',
    links: memo?.links.map((l) => ({ ...l })) ?? ([] as LinkDraft[]),
  });
  // 開いたときの更新日時。開いている間に読み直して memo が新しくなっても、こちらで比べる（ほかの人の変更を黙って上書きしない）
  const baseUpdatedAt = useRef(memo?.updatedAt);
  const [title, setTitle] = useState(start.current.title);
  const [categoryId, setCategoryId] = useState<string | null>(start.current.categoryId);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(start.current.subcategoryId);
  const [price, setPrice] = useState(start.current.price);
  const [body, setBody] = useState(start.current.body);
  const [links, setLinks] = useState<LinkDraft[]>(start.current.links);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify({ title, categoryId, subcategoryId, price, body, links }) !== JSON.stringify(start.current);

  function close() {
    if (dirty && !window.confirm('書いた内容を保存せずに閉じますか？')) return;
    onClose();
  }

  async function save() {
    setError(null);
    const name = title.trim();
    if (!name) return setError('名前を入れてください');
    const filledLinks = links.map((l) => ({ url: extractUrl(l.url), label: l.label.trim() })).filter((l) => l.url || l.label);
    const badLink = filledLinks.find((l) => urlProblem(l.url, true));
    if (badLink) return setError(`リンク：${urlProblem(badLink.url, true)}`);
    // 消された大カテゴリ・中カテゴリは外して送る
    const cat = categoryId ? categoryMap.get(categoryId) : undefined;
    const payload = {
      title: name,
      categoryId: cat?.id ?? null,
      subcategoryId: cat?.subcategories.some((s) => s.id === subcategoryId) ? subcategoryId : null,
      price: price === '' ? null : Number(price),
      body,
      links: filledLinks,
    };
    setBusy(true);
    try {
      const saved = memo ? await api.updateMemo(memo.id, { ...payload, baseUpdatedAt: baseUpdatedAt.current }) : await api.createMemo(payload);
      upsertMemo(saved);
      toast(memo ? '保存しました' : '追加しました');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // ほかの人が先に直していた：最新を読み直して閉じる（古い内容で上書きしない）
        await reload();
        toast(e.message, { error: true });
        onClose();
        return;
      }
      setError(errorText(e, '保存できませんでした'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={memo ? 'メモを直す' : '詳しく書く'} onClose={close} tall>
      <form
        className="memo-form space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="block space-y-1.5">
          <span className="label">名前</span>
          <input className="input" required maxLength={100} value={title} placeholder="例: ブックスタンド" onChange={(e) => setTitle(e.target.value)} autoFocus={!memo && !title} />
        </label>

        <div className="space-y-1.5">
          <label className="label block" htmlFor="memo-price">
            値段（任意）
          </label>
          <PriceInput id="memo-price" value={price} onChange={setPrice} />
        </div>

        <div className="space-y-2">
          <span className="label block">大カテゴリ（任意）</span>
          <CategoryGrid
            value={categoryId}
            onChange={(id) => {
              // 別の大カテゴリにしたら、中カテゴリは選び直す
              if (id !== categoryId) setSubcategoryId(null);
              setCategoryId(id);
            }}
          />
        </div>
        {categoryId && categoryMap.has(categoryId) && <SubcategoryPicker categoryId={categoryId} value={subcategoryId} onChange={setSubcategoryId} />}

        <label className="block space-y-1.5">
          <span className="label">詳細メモ</span>
          <textarea
            className="input min-h-32 py-2.5 leading-relaxed"
            maxLength={5000}
            value={body}
            placeholder="サイズ、型番、気になる点など"
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        <div className="space-y-2">
          <span className="label block">リンク</span>
          {links.map((l, i) => (
            <div key={i} className="card space-y-2 p-3">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 shrink-0 text-ink-3" />
                <input
                  className="input flex-1"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  aria-label={`リンク${i + 1}の URL`}
                  value={l.url}
                  onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  onBlur={() => l.url && setLinks(links.map((x, j) => (j === i ? { ...x, url: extractUrl(x.url) } : x)))}
                />
                <button type="button" className="icon-btn size-9" aria-label={`リンク${i + 1}を外す`} onClick={() => setLinks(links.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </button>
              </div>
              <input
                className="input"
                maxLength={100}
                placeholder="表示名（任意）"
                aria-label={`リンク${i + 1}の表示名`}
                value={l.label}
                onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
            </div>
          ))}
          {links.length < MAX_LINKS && (
            <button type="button" className="btn w-full" onClick={() => setLinks([...links, { url: '', label: '' }])}>
              <Plus className="size-4" />
              リンクを足す
            </button>
          )}
        </div>

        {error && <p className="rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? '保存中…' : memo ? '保存する' : '追加する'}
        </button>
      </form>
    </Sheet>
  );
}
