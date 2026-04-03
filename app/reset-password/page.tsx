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

    // Trigger automated email silently in the background
    await fetch("/api/account/email/password-changed", { method: "POST" });

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
    <div className="min-h-[calc(100vh-64px)] pt-24 pb-16 px-6 bg-[#F9F8F6] flex flex-col items-center justify-center">
      <Link href="/" className="mb-8">
        <div className="relative w-12 h-12">
          <Image src="/circular-logo-print-2400px.png" alt="Nutravoe" fill className="object-contain" />
        </div>
      </Link>

      <div className="w-full max-w-md bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-ink/5 overflow-hidden p-8 md:p-10">
        {!success ? (
          <div className="animate-in fade-in duration-300">
            <h1 className="font-display text-[28px] font-medium text-ink mb-2 leading-tight">
              Reset Password
            </h1>
            <p className="font-body text-[14px] text-stone mb-8">
              Enter a new secure password for your account.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                className="w-full bg-sage hover:bg-sage-dark disabled:opacity-50 text-white font-body text-sm font-medium py-3 rounded-md transition-colors shadow-sm mt-2"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center animate-in zoom-in-95 fade-in duration-500">
            <div className="w-16 h-16 rounded-full bg-sage/10 flex items-center justify-center text-sage mb-6 ring-1 ring-sage/20 shadow-inner">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
            </div>
            <h1 className="font-display text-[28px] font-medium text-ink mb-3 leading-tight">
              Password Updated
            </h1>
            <p className="font-body text-[14px] text-stone mb-2 px-2 leading-relaxed">
              Your password has been successfully reset! You can now sign in with your new password. Returning you to the login screen...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
