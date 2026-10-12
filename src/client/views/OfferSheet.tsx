import { Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { MAX_OFFERS } from '../../shared/schemas';
import type { Memo, Offer } from '../../shared/types';
import { api, ApiError, errorText } from '../api';
import { Sheet } from '../components/Sheet';
import { TagIcon } from '../components/TagIcon';
import { TagGrid } from '../components/TagPicker';
import { useToast } from '../components/Toast';
import { useAppData } from '../data';
import { emptyOffer, fromOfferDraft, OfferFields, toOfferDraft, urlProblem, type OfferDraft } from './MemoForm';

/**
 * 購入先1つ分の値段・商品ページのリンクを直す（詳細ページの候補を押したとき）。
 * offer が null なら、新しい購入先を選んで足す
 */
export function OfferSheet({ memo, offer, onClose }: { memo: Memo; offer: Offer | null; onClose: () => void }) {
  const { storeMap, upsertMemo, reload } = useAppData();
  const toast = useToast();
  // 開いたときのメモ。開いている間に読み直しても、この内容と更新日時を元に保存する（ほかの人の変更を黙って上書きしない）
  const base = useRef(memo);
  const [draft, setDraft] = useState<OfferDraft | null>(offer ? toOfferDraft(offer) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const store = draft ? storeMap.get(draft.storeId) : undefined;
  const used = memo.offers.map((o) => o.storeId);

  async function save(next: Offer[], message: string) {
    setBusy(true);
    setError(null);
    try {
      upsertMemo(await api.updateMemo(memo.id, { offers: next, baseUpdatedAt: base.current.updatedAt }));
      toast(message);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
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

  function submit() {
    if (!draft) return;
    const problem = urlProblem(draft.url, false);
    if (problem) return setError(problem);
    const value = fromOfferDraft(draft);
    const offers = base.current.offers;
    const next = offer ? offers.map((o) => (o.storeId === offer.storeId ? value : o)) : [...offers, value];
    void save(next, '保存しました');
  }

  return (
    <Sheet title={store ? store.name : '購入先を足す'} onClose={onClose}>
      {!draft ? (
        <div className="space-y-3">
          {used.length >= MAX_OFFERS ? (
            <p className="text-sm text-ink-2">購入先は{MAX_OFFERS}件までです。</p>
          ) : (
            <>
              <p className="text-sm text-ink-3">どこで買えるか選んでください（付いている購入先は選べません）。</p>
              <TagGrid kind="store" multiple={false} value={[]} onChange={(ids) => ids[0] && !used.includes(ids[0]) && setDraft(emptyOffer(ids[0]))} />
              {used.length > 0 && <p className="text-xs text-ink-3">付いている購入先：{used.map((id) => storeMap.get(id)?.name).filter(Boolean).join('・')}</p>}
            </>
          )}
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {store && (
            <div className="flex items-center gap-2">
              <TagIcon icon={store.icon} color={store.color} size="sm" />
              <span className="font-semibold">{memo.title}</span>
            </div>
          )}
          <OfferFields idPrefix="offer-sheet" draft={draft} onChange={setDraft} />
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {offer ? '保存する' : '足す'}
          </button>
          {offer && (
            <button
              type="button"
              className="btn btn-ghost btn-danger w-full"
              disabled={busy}
              onClick={() => void save(base.current.offers.filter((o) => o.storeId !== offer.storeId), `${store?.name ?? '購入先'}を外しました`)}
            >
              <Trash2 className="size-4" />
              この購入先を外す
            </button>
          )}
        </form>
      )}
    </Sheet>
  );
}
