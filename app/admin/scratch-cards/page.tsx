'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatInstantIst } from '@/lib/datetime-ist';

type Filter = 'unpaid' | 'paid' | 'all';

interface Card {
  id: string;
  code: string;
  customer_name: string | null;
  customer_phone: string;
  amount_rs: number;
  note: string | null;
  created_at: string;
  scratched_at: string | null;
  paid_at: string | null;
  payment_ref: string | null;
  link: string;
  whatsapp: string;
}

const th = 'px-4 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-stone';
const input = 'w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 font-body text-[16px] text-ink focus:border-sage focus:outline-none';

export default function AdminScratchCardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [filter, setFilter] = useState<Filter>('unpaid');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Card | null>(null);
  const [existing, setExisting] = useState<Card[] | null>(null);

  const [payId, setPayId] = useState<string | null>(null);
  const [payRef, setPayRef] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/scratch-cards?filter=${filter}`);
      if (!res.ok) throw new Error();
      setCards((await res.json()).cards ?? []);
    } catch {
      setError('Could not load scratch cards.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function create(allowRepeat = false) {
    setCreating(true);
    setError('');
    setCreated(null);
    try {
      const res = await fetch('/api/admin/scratch-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, note, allow_repeat: allowRepeat }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data?.error === 'already_has_card') {
        setExisting(data.existing ?? []);
        return;
      }
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not create the card');
      setExisting(null);
      setCreated(data.card);
      setName(''); setPhone(''); setNote('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create the card');
    } finally {
      setCreating(false);
    }
  }

  async function setPaid(id: string, paid: boolean, ref?: string) {
    const res = await fetch(`/api/admin/scratch-cards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid, payment_ref: ref ?? null }),
    });
    if (!res.ok) { showToast('Could not update'); return; }
    showToast(paid ? 'Marked as paid' : 'Marked as not paid');
    setPayId(null); setPayRef('');
    await load();
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); showToast('Link copied'); } catch { showToast(text); }
  }

  const owed = cards.filter((c) => !c.paid_at).reduce((s, c) => s + c.amount_rs, 0);
  const owedScratched = cards.filter((c) => !c.paid_at && c.scratched_at).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl text-ink">Scratch cards</h1>
        <p className="mt-0.5 max-w-2xl font-body text-[13px] text-stone">
          For customers who rated us on Zomato and messaged us on WhatsApp. Create a card, send it on WhatsApp, then pay the
          amount on GPay to the same number and mark it paid. Each card is worth ₹5 to ₹20, picked at random when you create it.
        </p>
      </div>

      <section className="mb-8 rounded-xl border border-black/10 bg-white p-5">
        <h2 className="mb-3 font-display text-lg text-ink">New card</h2>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); create(false); }}
        >
          <label className="block">
            <span className="mb-1 block font-body text-[12px] font-bold text-stone">WhatsApp number</span>
            <input className={input} inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-[12px] font-bold text-stone">Name (optional)</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-[12px] font-bold text-stone">Note (optional)</span>
            <input className={input} placeholder="e.g. 5★ review, order #1234" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="min-h-[44px] rounded-lg bg-sage px-5 font-body text-[13px] font-bold text-white hover:bg-sage-dark disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create card'}
          </button>
        </form>

        {existing ? (
          <div className="mt-4 rounded-lg border border-terracotta/30 bg-terracotta/5 p-4 font-body text-[13px] text-ink">
            <p className="font-bold">This number already has {existing.length === 1 ? 'a card' : `${existing.length} cards`}:</p>
            <ul className="mt-1 list-disc pl-5">
              {existing.map((c) => (
                <li key={c.id}>
                  ₹{c.amount_rs} on {formatInstantIst(c.created_at)} · {c.scratched_at ? 'scratched' : 'not scratched yet'} ·{' '}
                  {c.paid_at ? 'paid' : 'not paid'} ·{' '}
                  <a className="underline" href={c.whatsapp} target="_blank" rel="noreferrer">send again</a>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => create(true)} className="rounded-md bg-ink px-3 py-2 text-[12px] font-bold text-white">
                Create another card anyway
              </button>
              <button type="button" onClick={() => setExisting(null)} className="rounded-md border border-black/15 px-3 py-2 text-[12px] text-stone">
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {created ? (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-sage/30 bg-sage/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-body text-[13px] text-ink">
              Card created for <b>{created.customer_name || created.customer_phone}</b>. They’ll win <b>₹{created.amount_rs}</b>.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={created.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[40px] items-center rounded-lg bg-[#1fa855] px-4 font-body text-[13px] font-bold text-white"
              >
                Send on WhatsApp
              </a>
              <button type="button" onClick={() => copy(created.link)} className="min-h-[40px] rounded-lg border border-black/15 bg-white px-4 font-body text-[13px] text-ink">
                Copy link
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['unpaid', 'paid', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 font-body text-[11px] font-bold uppercase tracking-wider ${
                filter === f ? 'bg-ink text-white' : 'bg-white text-stone border border-black/10 hover:text-ink'
              }`}
            >
              {f === 'unpaid' ? 'To pay' : f === 'paid' ? 'Paid' : 'All'}
            </button>
          ))}
        </div>
        {filter !== 'paid' && cards.length ? (
          <p className="font-body text-[13px] text-stone">
            Still to pay: <b className="text-ink">₹{owed}</b> across {cards.filter((c) => !c.paid_at).length} cards ({owedScratched} scratched)
          </p>
        ) : null}
      </div>

      {toast && <div className="mb-4 rounded-lg border border-sage/30 bg-sage/10 px-4 py-2 font-body text-[13px] text-sage-dark">{toast}</div>}
      {error && <p className="mb-4 font-body text-sm text-terracotta">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-sage border-t-transparent" /></div>
      ) : !cards.length ? (
        <div className="rounded-xl border border-dashed border-black/10 bg-white py-16 text-center">
          <p className="font-body text-[14px] text-stone">No cards in this view.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-black/10 bg-[#F9F8F6]">
                <th className={th}>Customer</th>
                <th className={th}>Amount</th>
                <th className={th}>Created</th>
                <th className={th}>Scratched</th>
                <th className={th}>Paid</th>
                <th className={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-b border-black/5 align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-body text-[13px] text-ink">{c.customer_name || '—'}</p>
                    <p className="font-body text-[12px] text-stone">{c.customer_phone}</p>
                    {c.note ? <p className="font-body text-[11px] text-stone">{c.note}</p> : null}
                  </td>
                  <td className="px-4 py-3 font-body text-[14px] font-bold text-ink">₹{c.amount_rs}</td>
                  <td className="px-4 py-3 font-body text-[12px] text-stone">{formatInstantIst(c.created_at)}</td>
                  <td className="px-4 py-3 font-body text-[12px] text-stone">{c.scratched_at ? formatInstantIst(c.scratched_at) : 'Not yet'}</td>
                  <td className="px-4 py-3 font-body text-[12px] text-stone">
                    {c.paid_at ? (
                      <>
                        {formatInstantIst(c.paid_at)}
                        {c.payment_ref ? <span className="block text-[11px]">Ref {c.payment_ref}</span> : null}
                      </>
                    ) : 'Not paid'}
                  </td>
                  <td className="px-4 py-3">
                    {payId === c.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="w-40 rounded-md border border-black/15 px-2 py-1.5 text-[13px]"
                          placeholder="GPay ref (optional)"
                          value={payRef}
                          onChange={(e) => setPayRef(e.target.value)}
                        />
                        <button type="button" onClick={() => setPaid(c.id, true, payRef.trim())} className="rounded-md bg-sage px-2.5 py-1.5 text-[11px] font-bold text-white">Save</button>
                        <button type="button" onClick={() => { setPayId(null); setPayRef(''); }} className="rounded-md border border-black/15 px-2.5 py-1.5 text-[11px] text-stone">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {!c.paid_at ? (
                          <button type="button" onClick={() => setPayId(c.id)} className="rounded-md bg-sage px-2.5 py-1.5 font-body text-[11px] font-bold text-white hover:bg-sage-dark">
                            Mark paid
                          </button>
                        ) : (
                          <button type="button" onClick={() => setPaid(c.id, false)} className="rounded-md border border-black/15 px-2.5 py-1.5 font-body text-[11px] text-stone hover:bg-black/5">
                            Undo paid
                          </button>
                        )}
                        <a href={c.whatsapp} target="_blank" rel="noreferrer" className="rounded-md border border-black/15 px-2.5 py-1.5 font-body text-[11px] text-ink hover:bg-black/5">
                          WhatsApp
                        </a>
                        <button type="button" onClick={() => copy(c.link)} className="rounded-md border border-black/15 px-2.5 py-1.5 font-body text-[11px] text-ink hover:bg-black/5">
                          Copy link
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
