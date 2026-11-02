"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
export default function OtpBotCheck({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (!ready || !sitekey || !container.current || !api) return;
    const id = api.render(container.current, {
      sitekey, action: "otp-send", callback: onToken,
      "expired-callback": () => onToken(""), "error-callback": () => onToken(""),
    });
    return () => { api.remove(id); };
  }, [ready, sitekey, onToken]);
  if (!sitekey) return <p role="alert" className="mt-4 text-sm">Phone login is temporarily unavailable. Please try again later.</p>;
  return <div className="mt-4">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setReady(true)} />
    <div ref={container} />
  </div>;
}
