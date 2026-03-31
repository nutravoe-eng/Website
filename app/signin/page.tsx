"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type Step = "identifier" | "new-user" | "existing-user" | "success";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("identifier");
  const [isNewUser, setIsNewUser] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect on success
  useEffect(() => {
    if (step === "success") {
      const next = searchParams.get("next") ?? "/";
      const timer = setTimeout(() => router.push(next), 2000);
      return () => clearTimeout(timer);
    }
  }, [step, router, searchParams]);

  /* ── Step 1: check if email exists ── */
  const handleIdentifierSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const val = identifier.trim();
    if (!val) { setError("Please enter your email address."); return; }
    if (!val.includes("@")) { setError("Please enter a valid email address."); return; }

    setEmail(val);
    // We can't tell if email exists without exposing user data, so go straight to sign-in.
    // If sign-in fails we'll offer sign-up.
    setStep("existing-user");
  };

  /* ── Sign up ── */
  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name || !email || !password) { setError("Please fill in all fields."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, phone: phone || undefined },
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // Sign them in immediately (email confirmation disabled in Supabase dashboard)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Account created! Please sign in.");
      setStep("existing-user");
      return;
    }

    setIsNewUser(true);
    setStep("success");
  };

  /* ── Sign in ── */
  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (signInError) {
      if (signInError.message.toLowerCase().includes("invalid")) {
        // Could be wrong password OR email doesn't exist — offer sign-up
        setError("No account found with this email, or the password is incorrect.");
      } else {
        setError(signInError.message);
      }
      return;
    }

    setIsNewUser(false);
    setStep("success");
  };

  /* ── Forgot password ── */
  const handleForgotPassword = async () => {
    if (!email) { setError("Enter your email first, then click Forgot Password."); return; }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setError("");
    alert(`Password reset email sent to ${email}. Check your inbox.`);
  };

  return (
    <main className="min-h-[calc(100vh-64px)] pt-24 pb-16 px-6 bg-[#F9F8F6] flex flex-col items-center justify-center">
      {/* Brand Logo */}
      <Link href="/" className="mb-8">
        <div className="relative w-12 h-12">
          <Image src="/circular-logo-print-2400px.png" alt="Nutravoe" fill className="object-contain" />
        </div>
      </Link>

      <div className="w-full max-w-md bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-ink/5 overflow-hidden">
        <div className="p-8 md:p-10">

          {/* STEP 1: ENTER EMAIL */}
          {step === "identifier" && (
            <div className="animate-in fade-in duration-300">
              <h1 className="font-display text-[28px] font-medium text-ink mb-2 leading-tight">
                Sign in or create account
              </h1>
              <p className="font-body text-[14px] text-stone mb-8">
                Enter your email address to get started.
              </p>

              <form onSubmit={handleIdentifierSubmit} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="identifier" className="block font-body text-[13px] font-medium text-ink mb-1.5">
                    Email address
                  </label>
                  <input
                    id="identifier"
                    type="email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm focus:outline-none focus:border-sage focus:ring-1 focus:ring-sage transition-all"
                    autoFocus
                    required
                  />
                </div>

                {error && <p className="font-body text-[12px] text-terracotta">{error}</p>}

                <button type="submit" className="w-full bg-sage hover:bg-sage-dark text-white font-body text-sm font-medium py-3 rounded-md transition-colors shadow-sm mt-2">
                  Continue
                </button>
              </form>

              <p className="font-body text-[11px] text-stone mt-6 text-center leading-relaxed">
                By continuing, you agree to Nutravoe's{" "}
                <a href="#" className="underline hover:text-ink">Conditions of Use</a> and{" "}
                <a href="#" className="underline hover:text-ink">Privacy Notice</a>.
              </p>
            </div>
          )}

          {/* STEP 2: SIGN IN */}
          {step === "existing-user" && (
            <div className="animate-in fade-in duration-300">
              <h1 className="font-display text-[28px] font-medium text-ink mb-2 leading-tight">
                Sign in
              </h1>
              <div className="flex items-center gap-2 mb-8">
                <span className="font-body text-[14px] text-ink">{email}</span>
                <button onClick={() => { setStep("identifier"); setError(""); }} className="font-body text-[13px] text-sage hover:text-sage-dark font-medium underline">
                  Change
                </button>
              </div>

              <form onSubmit={handleSignIn} className="flex flex-col gap-4">
                <div>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <label className="block font-body text-[13px] font-medium text-ink">Password</label>
                    <button type="button" onClick={handleForgotPassword} className="font-body text-[12px] text-sage hover:underline">
                      Forgot Password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    autoFocus
                    required
                  />
                </div>

                {error && <p className="font-body text-[12px] text-terracotta">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-sage hover:bg-sage-dark disabled:opacity-50 text-white font-body text-sm font-medium py-3 rounded-md transition-colors shadow-sm mt-3"
                >
                  {loading ? "Signing in…" : "Sign In"}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-ink/5 text-center">
                <p className="font-body text-[13px] text-stone">
                  New to Nutravoe?{" "}
                  <button
                    onClick={() => { setStep("new-user"); setError(""); }}
                    className="text-sage font-medium hover:underline"
                  >
                    Create an account
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: SIGN UP */}
          {step === "new-user" && (
            <div className="animate-in zoom-in-95 duration-300">
              <div className="flex items-center justify-center w-12 h-12 bg-sage/10 rounded-full text-sage mb-4 mx-auto">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" x2="19" y1="8" y2="14"/>
                  <line x1="22" x2="16" y1="11" y2="11"/>
                </svg>
              </div>
              <h1 className="font-display text-[28px] font-medium text-ink mb-2 text-center leading-tight">
                Looks like you're new here!
              </h1>
              <p className="font-body text-[13.5px] text-stone mb-8 text-center px-4">
                We're absolutely thrilled to have you. Let's get your account set up.
              </p>

              <form onSubmit={handleSignUp} className="flex flex-col gap-4">
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">Mobile Number <span className="text-stone font-normal">(optional)</span></label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                  />
                </div>
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    required
                    minLength={6}
                  />
                </div>

                {error && <p className="font-body text-[12px] text-terracotta">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-terracotta hover:bg-terracotta/90 disabled:opacity-50 text-white font-body text-sm font-medium py-3 rounded-md transition-colors shadow-sm mt-3"
                >
                  {loading ? "Creating account…" : "Create Account"}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep("existing-user"); setError(""); }}
                  className="font-body text-[12px] text-stone hover:text-ink mt-1"
                >
                  Already have an account? Sign in
                </button>
              </form>
            </div>
          )}

          {/* SUCCESS */}
          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-10 text-center animate-in zoom-in-95 fade-in duration-500">
              <div className="w-16 h-16 rounded-full bg-sage/10 flex items-center justify-center text-sage mb-6 ring-1 ring-sage/20 shadow-inner">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
              </div>
              <h1 className="font-display text-[32px] font-medium text-ink mb-3 leading-tight">
                {isNewUser ? "Welcome aboard!" : "Welcome back!"}
              </h1>
              <p className="font-body text-[14px] text-stone mb-2 px-2 leading-relaxed">
                {isNewUser
                  ? "Your account is ready. Let's get your morning sorted."
                  : "We're so glad to see you again. Taking you to the menu..."}
              </p>
              <div className="mt-8 flex gap-2 justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-sage/40 animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-1.5 h-1.5 rounded-full bg-sage/70 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-1.5 h-1.5 rounded-full bg-sage animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          )}

        </div>

        <div className="bg-[#F9F8F6]/80 px-8 py-5 border-t border-ink/5 flex justify-center">
          <p className="font-body text-[11px] text-stone">
            Need help? Contact us on <a href="#" className="underline hover:text-ink">WhatsApp</a>
          </p>
        </div>
      </div>
    </main>
  );
}
