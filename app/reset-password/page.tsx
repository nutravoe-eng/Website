"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event) => {
      // Logs when a user successfully enters via the recovery link token
      if (event === "PASSWORD_RECOVERY") {
        console.log("Recovery session established. Awaiting new password.");
      }
    });
  }, [supabase.auth]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    });

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    // Trigger automated email and log failures for easier debugging.
    try {
      const emailRes = await fetch("/api/account/email/password-changed", { method: "POST" });
      if (!emailRes.ok) {
        const payload = await emailRes.json().catch(() => null);
        console.warn(
          "[reset-password] password changed email trigger failed:",
          typeof payload?.error === "string" ? payload.error : "Unknown error",
        );
      }
    } catch (err) {
      console.warn("[reset-password] password changed email trigger errored:", err);
    }

    // Since the password changed, we may want to ensure they sign in fresh with the new password,
    // so we sign them out to clear the temporary recovery session.
    await supabase.auth.signOut();

    setLoading(false);
    setSuccess(true);
    
    setTimeout(() => {
      router.push("/signin");
    }, 4000);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {!success ? (
          <>
            <div className="flex-none flex items-center px-5 pt-4 pb-2">
              <Link href="/signin" aria-label="Back to sign in" className="flex items-center justify-center h-10 w-10 -ml-2 rounded-full text-ink transition-colors hover:bg-black/5">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
              <div className="relative mb-7 h-8 w-8">
                <Image src="/Nutravoe Logo.png" alt="Nutravoe" fill className="object-contain" />
              </div>
              <h1 className="mb-2 font-display text-[34px] font-light leading-[1.1] text-ink">
                Reset your<br />password
              </h1>
              <p className="mb-9 font-body text-[14px] leading-relaxed text-stone">
                Enter a new secure password for your account.
              </p>

              <form id="reset-password-form-mobile" onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block font-body text-[13px] font-medium text-ink">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 font-body text-[15px] text-ink outline-none transition-all focus:border-sage focus:ring-2 focus:ring-sage/15"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block font-body text-[13px] font-medium text-ink">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 font-body text-[15px] text-ink outline-none transition-all focus:border-sage focus:ring-2 focus:ring-sage/15"
                    required
                  />
                </div>

                {error ? (
                  <p role="alert" className="font-body text-[12px] text-terracotta">
                    {error}
                  </p>
                ) : null}
              </form>
            </div>
            <div className="flex-none px-6" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
              <button
                type="submit"
                form="reset-password-form-mobile"
                disabled={loading}
                className="w-full rounded-xl bg-sage py-3 font-body text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-sage-dark disabled:opacity-50"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10 text-sage ring-1 ring-sage/20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="mb-3 font-display text-[36px] font-light leading-tight text-ink">
              Password updated
            </h1>
            <p className="font-body text-[14px] leading-relaxed text-stone">
              Your password has been reset. Taking you back to sign in...
            </p>
          </div>
        )}
      </div>

      <div className="hidden min-h-[calc(100vh-64px)] flex-col items-center justify-start bg-[#F9F8F6] px-4 pb-10 pt-18 md:flex md:justify-center md:px-6 md:pb-16 md:pt-24">
        <Link href="/" className="mb-5 md:mb-6">
          <div className="relative h-10 w-10 md:h-12 md:w-12">
            <Image src="/Nutravoe Logo.png" alt="Nutravoe" fill className="object-contain" />
          </div>
        </Link>

        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-ink/5 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:rounded-xl md:p-10">
          {!success ? (
            <div className="animate-in fade-in duration-300">
              <h1 className="mb-2 font-display text-[22px] font-medium leading-tight text-ink md:text-[28px]">
                Reset Password
              </h1>
              <p className="mb-5 font-body text-[12px] leading-relaxed text-stone md:mb-8 md:text-[14px]">
                Enter a new secure password for your account.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3 md:gap-4">
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    required
                  />
                </div>

                {error && (
                  <p role="alert" className="font-body text-[12px] text-terracotta">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full rounded-md bg-sage py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sage-dark disabled:opacity-50"
                >
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-center animate-in zoom-in-95 fade-in duration-500 md:py-6">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-sage/10 text-sage ring-1 ring-sage/20 shadow-inner md:mb-6 md:h-16 md:w-16">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
              </div>
              <h1 className="mb-3 font-display text-[22px] font-medium leading-tight text-ink md:text-[28px]">
                Password Updated
              </h1>
              <p className="mb-2 px-1 font-body text-[12px] leading-relaxed text-stone md:px-2 md:text-[14px]">
                Your password has been successfully reset! You can now sign in with your new password. Returning you to the login screen...
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
