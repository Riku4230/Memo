import { ChevronDown, Link2, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { MAX_LINKS } from '../../shared/schemas';
import type { Memo } from '../../shared/types';
import { extractUrl, isHttpUrl } from '../../shared/url';
import { api, ApiError, errorText } from '../api';
import { PriceInput } from '../components/PriceInput';
import { Sheet } from '../components/Sheet';
import { TagIcon } from '../components/TagIcon';
import { TagPickerSheet } from '../components/TagPicker';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';

/** 入力中の候補（値段は数字の文字列。空なら値段なし） */
export interface OfferDraft {
  storeId: string;
  price: string;
  url: string;
  note: string;
  checkedOn: string;
}
interface LinkDraft {
  url: string;
  label: string;
}

export function toOfferDraft(o: Memo['offers'][number]): OfferDraft {
  return { storeId: o.storeId, price: o.price === null ? '' : String(o.price), url: o.url, note: o.note, checkedOn: o.checkedOn ?? '' };
}
export function fromOfferDraft(d: OfferDraft): Memo['offers'][number] {
  return { storeId: d.storeId, price: d.price === '' ? null : Number(d.price), url: d.url.trim(), note: d.note.trim(), checkedOn: d.checkedOn || null };
}
export function emptyOffer(storeId: string): OfferDraft {
  return { storeId, price: '', url: '', note: '', checkedOn: '' };
}

/** 入れた URL が使えなければ、その理由（空なら問題なし） */
export function urlProblem(url: string, required: boolean): string | null {
  const s = url.trim();
  if (!s) return required ? 'URL を入れてください' : null;
  return isHttpUrl(s) ? null : 'http:// か https:// で始まる URL を入れてください';
}

/** 候補1つ分の入力欄（値段・商品ページのリンク）。ひとこと・確かめた日は入力しない（前に入れた値はそのまま残す） */
export function OfferFields({ draft, onChange, idPrefix }: { draft: OfferDraft; onChange: (d: OfferDraft) => void; idPrefix: string }) {
  const urlError = urlProblem(draft.url, false);
  const [touched, setTouched] = useState(false);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="label block" htmlFor={`${idPrefix}-price`}>
          値段
        </label>
        <PriceInput id={`${idPrefix}-price`} value={draft.price} onChange={(price) => onChange({ ...draft, price })} />
      </div>
      <label className="block space-y-1">
        <span className="label">商品ページのリンク</span>
        <input
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={draft.url}
          aria-invalid={touched && !!urlError}
          onChange={(e) => onChange({ ...draft, url: e.target.value })}
          onBlur={() => {
            setTouched(true);
            if (draft.url) onChange({ ...draft, url: extractUrl(draft.url) });
          }}
        />
        {touched && urlError && <span className="block text-xs text-danger">{urlError}</span>}
      </label>
    </div>
  );
}

interface Props {
  /** 編集するメモ。新規なら undefined */
  memo?: Memo;
  /** 新規のときの初めの値（すぐ登録の入力欄から開いたとき） */
  initial?: { title: string; genreId: string | null; storeIds: string[] };
  onClose: () => void;
  onSaved?: (memo: Memo) => void;
}

/** 全項目（名前・ジャンル・購入先ごとの値段・詳細メモ・リンク）をまとめて書く・直すシート */
export function MemoForm({ memo, initial, onClose, onSaved }: Props) {
  const { storeMap, genreMap, upsertMemo, reload } = useAppData();
  const toast = useToast();
  const start = useRef({
    title: memo?.title ?? initial?.title ?? '',
    genreId: memo?.genreId ?? initial?.genreId ?? null,
    offers: memo ? memo.offers.map(toOfferDraft) : (initial?.storeIds ?? []).map(emptyOffer),
    body: memo?.body ?? '',
    links: memo?.links.map((l) => ({ ...l })) ?? ([] as LinkDraft[]),
  });
  // 開いたときの更新日時。開いている間に読み直して memo が新しくなっても、こちらで比べる（ほかの人の変更を黙って上書きしない）
  const baseUpdatedAt = useRef(memo?.updatedAt);
  const [title, setTitle] = useState(start.current.title);
  const [genreId, setGenreId] = useState<string | null>(start.current.genreId);
  const [offers, setOffers] = useState<OfferDraft[]>(start.current.offers);
  const [body, setBody] = useState(start.current.body);
  const [links, setLinks] = useState<LinkDraft[]>(start.current.links);
  const [picker, setPicker] = useState<'genre' | 'store' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const genre = genreId ? genreMap.get(genreId) : undefined;
  const dirty = JSON.stringify({ title, genreId, offers, body, links }) !== JSON.stringify(start.current);

  function close() {
    if (dirty && !window.confirm('書いた内容を保存せずに閉じますか？')) return;
    onClose();
  }

  async function save() {
    setError(null);
    const name = title.trim();
    if (!name) return setError('名前を入れてください');
    const badOffer = offers.find((o) => urlProblem(o.url, false));
    if (badOffer) return setError(`${storeMap.get(badOffer.storeId)?.name ?? '購入先'}のリンク：${urlProblem(badOffer.url, false)}`);
    const filledLinks = links.map((l) => ({ url: extractUrl(l.url), label: l.label.trim() })).filter((l) => l.url || l.label);
    const badLink = filledLinks.find((l) => urlProblem(l.url, true));
    if (badLink) return setError(`リンク：${urlProblem(badLink.url, true)}`);
    const payload = {
      title: name,
      genreId: genreId && genreMap.has(genreId) ? genreId : null,
      offers: offers.filter((o) => storeMap.has(o.storeId)).map(fromOfferDraft),
      body,
      links: filledLinks,
    };
    setBusy(true);
    try {
      const saved = memo ? await api.updateMemo(memo.id, { ...payload, baseUpdatedAt: baseUpdatedAt.current }) : await api.createMemo(payload);
      upsertMemo(saved);
      toast(memo ? '保存しました' : `「${saved.title}」を追加しました`);
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
          <input className="input" required maxLength={100} value={title} placeholder="例: ドラム式洗濯機" onChange={(e) => setTitle(e.target.value)} autoFocus={!memo && !title} />
        </label>

        <div className="space-y-1.5">
          <span className="label">ジャンル</span>
          <div>
            <button type="button" className="chip" aria-pressed={!!genre} onClick={() => setPicker('genre')}>
              {genre && <TagIcon icon={genre.icon} color={genre.color} size="xs" />}
              {genre?.name ?? '選ばない'}
              <ChevronDown className="size-3.5 opacity-60" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="label">購入先と値段</span>
          {offers.map((o, i) => {
            const store = storeMap.get(o.storeId);
            if (!store) return null;
            return (
              <div key={o.storeId} className="card space-y-3 p-3.5">
                <div className="flex items-center gap-2">
                  <TagIcon icon={store.icon} color={store.color} size="sm" />
                  <span className="flex-1 font-semibold">{store.name}</span>
                  <button type="button" className="icon-btn size-9" aria-label={`${store.name}を外す`} onClick={() => setOffers(offers.filter((_, j) => j !== i))}>
                    <X className="size-4" />
                  </button>
                </div>
                <OfferFields idPrefix={`offer-${i}`} draft={o} onChange={(d) => setOffers(offers.map((x, j) => (j === i ? d : x)))} />
              </div>
            );
          })}
          <button type="button" className="btn btn-soft w-full" onClick={() => setPicker('store')}>
            <Plus className="size-4" />
            購入先を選ぶ
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="label">詳細メモ</span>
          <textarea
            className="input min-h-32 py-2.5 leading-relaxed"
            maxLength={5000}
            value={body}
            placeholder="候補の型番、サイズ、気になる点など"
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        <div className="space-y-2">
          <span className="label">リンク（レビュー記事など）</span>
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

      {picker === 'genre' && (
        <TagPickerSheet kind="genre" multiple={false} value={genreId ? [genreId] : []} onChange={(ids) => setGenreId(ids[0] ?? null)} onClose={() => setPicker(null)} />
      )}
      {picker === 'store' && (
        <TagPickerSheet
          kind="store"
          multiple
          value={offers.map((o) => o.storeId)}
          // 外した購入先は候補ごと外し、足した購入先は空の候補を足す（書きかけの値段は消さない）
          onChange={(ids) => setOffers([...offers.filter((o) => ids.includes(o.storeId)), ...ids.filter((id) => !offers.some((o) => o.storeId === id)).map(emptyOffer)])}
          onClose={() => setPicker(null)}
        />
      )}
    </Sheet>
  );
}
