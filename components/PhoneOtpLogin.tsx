"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Step = "phone" | "otp";

export default function PhoneOtpLogin({ redirectTo = "/account" }: { redirectTo?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "otp") otpInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const digitsOnly = phone.replace(/\D/g, "");
  const isPhoneValid = digitsOnly.length === 10;
  const isCodeValid = /^\d{4,8}$/.test(code);

  async function sendOtp() {
    if (!isPhoneValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digitsOnly }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Couldn't send OTP. Please try again.");
        return;
      }
      setStep("otp");
      setResendCooldown(30);
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (!isCodeValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digitsOnly, code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Incorrect code. Please try again.");
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-[28px] italic text-ink">
        {step === "phone" ? "Log in with your phone" : "Enter the code"}
      </h1>
      <p className="mt-2 font-body text-[13px] leading-relaxed text-stone">
        {step === "phone"
          ? "We'll send a one-time code by SMS."
          : `Sent by SMS to +91 ${digitsOnly}.`}
      </p>

      {step === "phone" ? (
        <div className="mt-6">
          <label className="mb-1.5 block font-body text-[11px] font-bold uppercase tracking-[0.14em] text-stone">
            Phone number
          </label>
          <div className="flex items-center overflow-hidden rounded-xl border border-black/12 focus-within:border-sage">
            <span className="border-r border-black/12 bg-black/[0.03] px-3.5 py-3 font-body text-sm text-stone">
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={10}
              value={digitsOnly}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              onKeyDown={(e) => e.key === "Enter" && sendOtp()}
              placeholder="98765 43210"
              className="w-full bg-transparent px-3.5 py-3 font-body text-sm text-ink outline-none"
            />
          </div>

          {error ? <p className="mt-2 font-body text-[12px] text-terracotta">{error}</p> : null}

          <button
            type="button"
            onClick={sendOtp}
            disabled={!isPhoneValid || loading}
            className="btn-sage mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <label className="mb-1.5 block font-body text-[11px] font-bold uppercase tracking-[0.14em] text-stone">
            One-time code
          </label>
          <input
            ref={otpInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
            placeholder="123456"
            className="w-full rounded-xl border border-black/12 px-3.5 py-3 text-center font-body text-lg tracking-[0.3em] text-ink outline-none focus:border-sage"
          />

          {error ? <p className="mt-2 font-body text-[12px] text-terracotta">{error}</p> : null}

          <button
            type="button"
            onClick={verifyOtp}
            disabled={!isCodeValid || loading}
            className="btn-sage mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify & Continue"}
          </button>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
              className="font-body text-[12px] text-stone underline decoration-black/15 underline-offset-4"
            >
              Change number
            </button>
            <button
              type="button"
              onClick={sendOtp}
              disabled={resendCooldown > 0 || loading}
              className="font-body text-[12px] text-sage-dark underline decoration-sage/30 underline-offset-4 disabled:cursor-not-allowed disabled:text-stone disabled:no-underline"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
