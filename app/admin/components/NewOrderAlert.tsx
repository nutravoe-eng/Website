'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * New-order alert for the admin panel.
 *
 * Checks for new orders every few seconds. When one arrives it shows a popup with
 * an "Accept" button, sounds a buzzer until someone accepts, and (if allowed)
 * shows a system notification so it is seen even when this tab is in the background.
 * Accepting only stops the buzzer and closes the popup; it does not change the order.
 *
 * Accepted orders are remembered in this browser, so they never buzz again, and
 * accepting in one tab silences every open admin tab.
 */

type AlertOrder = {
  id: string;
  order_type: string;
  payment_method: string;
  payment_status: string;
  delivery_date: string | null;
  delivery_time_slot: string | null;
  total: number;
  notes: string | null;
  created_at: string;
  users?: { full_name?: string | null } | null;
  order_items?: { bowl_name: string; quantity: number; customizations: unknown }[];
};

const POLL_MS = 10_000;
const BUZZ_EVERY_MS = 2_500;
const ACCEPTED_KEY = 'nv-admin-accepted-orders';
const SOUND_KEY = 'nv-admin-alert-sound-on';
const INIT_KEY = 'nv-admin-alerts-started';

const readAccepted = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(ACCEPTED_KEY) || '[]')); } catch { return new Set(); }
};
const writeAccepted = (ids: Set<string>) => {
  try { localStorage.setItem(ACCEPTED_KEY, JSON.stringify(Array.from(ids).slice(-1000))); } catch { /* storage off */ }
};

function itemLine(i: { bowl_name: string; quantity: number; customizations: unknown }): string {
  const extras: string[] = [];
  const c = i.customizations as Record<string, unknown> | unknown[] | null;
  if (c && !Array.isArray(c) && typeof c === 'object') {
    if (c.noSugar) extras.push('no sugar');
    if (Array.isArray(c.removed) && c.removed.length) extras.push('no ' + (c.removed as string[]).join(', no '));
    if (Array.isArray(c.added) && c.added.length) extras.push('+ ' + (c.added as string[]).join(', '));
    if (typeof c.baseChoice === 'string' && c.baseChoice !== 'yogurt') extras.push(c.baseChoice + ' base');
    if (typeof c.oatsChoice === 'string') extras.push(c.oatsChoice + ' oats');
  } else if (Array.isArray(c)) {
    const flat = (c as unknown[]).flatMap((e) => (Array.isArray(e) ? e : [e])) as { ingredientId?: string; option?: string }[];
    for (const e of flat) {
      if (!e?.ingredientId || e.option === 'default') continue;
      const name = e.ingredientId.replace(/^ingredient[-_]/i, '').replace(/[-_]+/g, ' ');
      extras.push((e.option === 'remove' ? 'no ' : 'extra ') + name);
    }
  }
  return `${i.quantity}× ${i.bowl_name}${extras.length ? ` (${Array.from(new Set(extras)).join('; ')})` : ''}`;
}

const rupees = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const payText = (o: AlertOrder) =>
  o.payment_method === 'razorpay' ? 'Paid online'
  : o.payment_method === 'wallet' ? 'Subscription (wallet)'
  : o.payment_status === 'paid' ? 'Paid'
  : `Collect ${rupees(o.total)} (COD)`;
const slotText = (o: AlertOrder) => {
  const slot = (o.delivery_time_slot || '').replace(/^(today|tomorrow)\s*,\s*/i, '');
  const day = o.delivery_date
    ? new Date(o.delivery_date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    : '';
  return slot.includes('·') ? slot : [day, slot].filter(Boolean).join(' · ');
};

export default function NewOrderAlert() {
  const [pending, setPending] = useState<AlertOrder[]>([]);
  const [soundReady, setSoundReady] = useState(true);
  const [notifyState, setNotifyState] = useState<NotificationPermission | 'unsupported'>('default');

  const audioRef = useRef<AudioContext | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastPollRef = useRef(0);
  const lastBuzzRef = useRef(0);
  const pendingRef = useRef<AlertOrder[]>([]);
  const notesRef = useRef<Map<string, Notification>>(new Map());

  pendingRef.current = pending;

  // ---- buzzer: made in the browser, no sound file needed ----
  const buzz = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = k % 2 ? 660 : 880;
      const s = t0 + k * 0.32;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.35, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.26);
      o.connect(g).connect(ctx.destination);
      o.start(s);
      o.stop(s + 0.28);
    }
  }, []);

  const unlockSound = useCallback(async () => {
    try {
      if (!audioRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioRef.current = new Ctx();
      }
      await audioRef.current.resume();
      setSoundReady(audioRef.current.state === 'running');
      try { localStorage.setItem(SOUND_KEY, '1'); } catch { /* ignore */ }
    } catch { setSoundReady(false); }
    if ('Notification' in window && Notification.permission === 'default') {
      try { setNotifyState(await Notification.requestPermission()); } catch { /* ignore */ }
    }
  }, []);

  const closeNotifications = useCallback((ids?: string[]) => {
    for (const [id, n] of Array.from(notesRef.current.entries())) {
      if (!ids || ids.includes(id)) { try { n.close(); } catch { /* ignore */ } notesRef.current.delete(id); }
    }
  }, []);

  const notify = useCallback((o: AlertOrder) => {
    if (!('Notification' in window) || Notification.permission !== 'granted' || notesRef.current.has(o.id)) return;
    try {
      const n = new Notification('New Nutravoe order · ' + rupees(o.total), {
        body: [(o.order_items || []).map(itemLine).join(', '), slotText(o), payText(o)].filter(Boolean).join('\n'),
        tag: 'nv-order-' + o.id,
        requireInteraction: true,
        icon: '/icon-128px.png',
      });
      n.onclick = () => { window.focus(); n.close(); };
      notesRef.current.set(o.id, n);
    } catch { /* some browsers only allow notifications from a service worker */ }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/orders/recent', { cache: 'no-store' });
      if (!res.ok) return;
      const { orders } = (await res.json()) as { orders: AlertOrder[] };
      const accepted = readAccepted();
      // The very first time alerts run in this browser, treat existing orders as already seen.
      let started = false;
      try { started = localStorage.getItem(INIT_KEY) === '1'; } catch { started = true; }
      if (!started) {
        for (const o of orders) accepted.add(o.id);
        writeAccepted(accepted);
        try { localStorage.setItem(INIT_KEY, '1'); } catch { /* ignore */ }
      }
      const fresh = orders.filter((o) => !accepted.has(o.id));
      setPending(fresh);
      fresh.forEach(notify);
    } catch { /* offline: try again next tick */ }
  }, [notify]);

  const accept = useCallback(() => {
    const accepted = readAccepted();
    const ids = pendingRef.current.map((o) => o.id);
    ids.forEach((id) => accepted.add(id));
    writeAccepted(accepted);
    closeNotifications(ids);
    setPending([]);
  }, [closeNotifications]);

  // Timers run in a small worker so the browser doesn't slow them down in a background tab.
  useEffect(() => {
    setNotifyState('Notification' in window ? Notification.permission : 'unsupported');
    let soundWasOn = false;
    try { soundWasOn = localStorage.getItem(SOUND_KEY) === '1'; } catch { /* ignore */ }
    setSoundReady(false);
    if (soundWasOn) unlockSound(); // works if the browser already allows sound for this site

    // Any click on the page also turns the sound on (browsers require a click first).
    const onFirstClick = () => { if (!audioRef.current || audioRef.current.state !== 'running') unlockSound(); };
    document.addEventListener('pointerdown', onFirstClick);

    // Accepting in another admin tab silences this one too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ACCEPTED_KEY) return;
      const accepted = readAccepted();
      const stillPending = pendingRef.current.filter((o) => !accepted.has(o.id));
      closeNotifications(pendingRef.current.filter((o) => accepted.has(o.id)).map((o) => o.id));
      setPending(stillPending);
    };
    window.addEventListener('storage', onStorage);

    const src = 'setInterval(function(){postMessage(0)},1000);';
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    workerRef.current = worker;
    worker.onmessage = () => {
      const now = Date.now();
      if (now - lastPollRef.current >= POLL_MS) { lastPollRef.current = now; poll(); }
      if (pendingRef.current.length && now - lastBuzzRef.current >= BUZZ_EVERY_MS) { lastBuzzRef.current = now; buzz(); }
    };
    lastPollRef.current = Date.now();
    poll();

    return () => {
      worker.terminate();
      document.removeEventListener('pointerdown', onFirstClick);
      window.removeEventListener('storage', onStorage);
      closeNotifications();
    };
  }, [poll, buzz, unlockSound, closeNotifications]);

  // Flash the tab title while an order waits.
  useEffect(() => {
    if (!pending.length) return;
    const original = document.title;
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? `🔔 ${pending.length} NEW ORDER${pending.length > 1 ? 'S' : ''}` : original;
    }, 1000);
    return () => { clearInterval(t); document.title = original; };
  }, [pending.length]);

  return (
    <>
      {(!soundReady || notifyState === 'default') && !pending.length && (
        <button
          type="button"
          onClick={unlockSound}
          className="fixed bottom-4 right-4 z-[60] rounded-full bg-ink px-4 py-2.5 font-body text-[12px] font-bold uppercase tracking-wider text-white shadow-lg"
        >
          🔔 Turn on order alerts
        </button>
      )}

      {pending.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="nv-new-order-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p id="nv-new-order-title" className="font-display text-2xl text-ink">
              {pending.length === 1 ? 'New order!' : `${pending.length} new orders!`}
            </p>
            {!soundReady && (
              <p className="mt-1 font-body text-[12px] text-terracotta">Sound is off in this tab. Click anywhere to turn it on.</p>
            )}
            <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto">
              {pending.map((o) => (
                <div key={o.id} className="rounded-xl border border-black/10 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-body text-[14px] font-bold text-ink">{o.users?.full_name || 'Customer'}</p>
                    <p className="font-body text-[14px] font-bold text-ink">{rupees(o.total)}</p>
                  </div>
                  <ul className="mt-1 font-body text-[14px] text-ink">
                    {(o.order_items || []).map((i, k) => <li key={k}>{itemLine(i)}</li>)}
                  </ul>
                  <p className="mt-1 font-body text-[12px] text-stone">{slotText(o)} · {payText(o)}</p>
                  {o.notes && <p className="mt-1 font-body text-[12px] text-ink">Note: {o.notes}</p>}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={accept}
              autoFocus
              className="mt-5 w-full rounded-xl bg-ink py-3.5 font-body text-[15px] font-bold uppercase tracking-wider text-white"
            >
              Accept
            </button>
          </div>
        </div>
      )}
    </>
  );
}
