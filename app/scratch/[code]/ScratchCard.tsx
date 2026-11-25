"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./scratch.module.css";

const CONFETTI = ["#b5175e", "#2f9e5b", "#ffffff", "#ff6b9a", "#7d1048"];

export default function ScratchCard({
  code,
  amount,
  alreadyScratched,
  paid,
}: {
  code: string;
  amount: number;
  alreadyScratched: boolean;
  paid: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(alreadyScratched);
  const [burst, setBurst] = useState(false);
  const state = useRef({ down: false, last: null as null | { x: number; y: number }, dpr: 1, strokes: 0, done: alreadyScratched });

  const paint = useCallback(() => {
    const cv = canvasRef.current, card = cardRef.current;
    if (!cv || !card || state.current.done) return;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const r = card.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.current.dpr = dpr;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const W = cv.width, H = cv.height, u = W / 400;
    ctx.globalCompositeOperation = "source-over";
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#d12a74"); g.addColorStop(0.5, "#b5175e"); g.addColorStop(1, "#7d1048");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = ctx.createLinearGradient(0, 0, W, 0);
    s.addColorStop(0, "rgba(255,255,255,0)"); s.addColorStop(0.45, "rgba(255,255,255,.16)"); s.addColorStop(0.55, "rgba(255,255,255,0)");
    ctx.fillStyle = s; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.13)";
    for (let y = 18 * u; y < H; y += 34 * u)
      for (let x = (Math.round(y / (34 * u)) % 2 ? 18 : 35) * u; x < W; x += 34 * u) { ctx.beginPath(); ctx.arc(x, y, 3.2 * u, 0, 7); ctx.fill(); }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.beginPath(); ctx.arc(W / 2, H / 2 - 64 * u, 16 * u, 0, 7); ctx.fillStyle = "#ffc23d"; ctx.fill();
    ctx.fillStyle = "#7d1048"; ctx.font = `700 ${17 * u}px system-ui, sans-serif`; ctx.fillText("₹", W / 2, H / 2 - 63 * u);
    ctx.fillStyle = "#fff"; ctx.font = `800 ${34 * u}px system-ui, sans-serif`; ctx.fillText("Scratch here", W / 2, H / 2 - 10 * u);
    ctx.globalAlpha = 0.85; ctx.font = `600 ${15 * u}px system-ui, sans-serif`; ctx.fillText("to reveal your cashback", W / 2, H / 2 + 24 * u); ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    if (alreadyScratched) return;
    paint();
    const card = cardRef.current;
    if (!card) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(card);
    return () => ro.disconnect();
  }, [alreadyScratched, paint]);

  const reveal = useCallback(() => {
    if (state.current.done) return;
    state.current.done = true;
    setRevealed(true);
    setBurst(true);
    fetch(`/api/scratch/${code}`, { method: "POST" }).catch(() => {});
  }, [code]);

  const check = useCallback(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d", { willReadFrequently: true });
    if (!cv || !ctx) return;
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let clear = 0, n = 0;
    for (let i = 3; i < d.length; i += 64) { n++; if (d[i] === 0) clear++; }
    if (clear / n > 0.45) reveal();
  }, [reveal]);

  const scratchAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d", { willReadFrequently: true });
    if (!cv || !ctx) return;
    const r = cv.getBoundingClientRect(), dpr = state.current.dpr;
    const p = { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
    const from = state.current.last || p;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 46 * dpr;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 23 * dpr, 0, 7); ctx.fill();
    state.current.last = p;
    if (++state.current.strokes % 6 === 0) check();
  };

  return (
    <>
      <div className={styles.card} ref={cardRef}>
        <div className={styles.prize} aria-live="polite">
          <span className={styles.won}>{revealed ? "You won" : " "}</span>
          <span className={styles.amt}>₹{amount}</span>
          <span className={styles.sub}>cashback</span>
          {burst ? (
            <div className={styles.burst} aria-hidden="true">
              {Array.from({ length: 26 }, (_, i) => {
                const a = (i / 26) * Math.PI * 2, dist = 110 + (i % 5) * 22;
                return (
                  <i
                    key={i}
                    style={{
                      background: CONFETTI[i % 5],
                      ["--x" as string]: `calc(-50% + ${Math.round(Math.cos(a) * dist)}px)`,
                      ["--y" as string]: `calc(-50% + ${Math.round(Math.sin(a) * dist)}px)`,
                      ["--r" as string]: `${i * 47}deg`,
                      animationDelay: `${(i % 4) * 30}ms`,
                    }}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
        {!alreadyScratched ? (
          <canvas
            ref={canvasRef}
            className={`${styles.foil} ${revealed ? styles.gone : ""}`}
            role="img"
            aria-label="Scratch card. Drag across it to scratch."
            onPointerDown={(e) => {
              if (state.current.done) return;
              state.current.down = true; state.current.last = null;
              e.currentTarget.setPointerCapture(e.pointerId);
              scratchAt(e);
            }}
            onPointerMove={(e) => { if (state.current.down && !state.current.done) scratchAt(e); }}
            onPointerUp={() => { state.current.down = false; state.current.last = null; if (!state.current.done) check(); }}
            onPointerCancel={() => { state.current.down = false; state.current.last = null; }}
          />
        ) : null}
      </div>

      <p className={styles.hint}>
        {!revealed
          ? "Drag your finger across the card."
          : paid
            ? `We’ve sent your ₹${amount} cashback on GPay. Enjoy!`
            : `We’ll send Rs ${amount} to your GPay number`}
      </p>
      {revealed ? (
        <Link className={styles.order} href="/menu">
          Order your next bowl
        </Link>
      ) : null}
    </>
  );
}
