"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";

const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false });

type Step = "identifier" | "new-user" | "existing-user" | "success";

function SignInForm() {
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
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [pincode, setPincode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>();

  // Redirect on success
  useEffect(() => {
    if (step === "success") {
      const next = searchParams.get("next") ?? "/";
      const timer = setTimeout(() => router.push(next), 2000);
      return () => clearTimeout(timer);
    }
  }, [step, router, searchParams]);

  // Geocode pincode to center the map when pincode is complete
  useEffect(() => {
    if (pincode.length !== 6) return;
    fetch(`/api/geocode?pincode=${pincode}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.lat && d.lng) {
          setMapCenter({ lat: d.lat, lng: d.lng });
          setPinLat(d.lat);
          setPinLng(d.lng);
        }
      })
      .catch(() => {});
  }, [pincode]);

  /* ── Step 1: check if email exists ── */
  const handleIdentifierSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const val = identifier.trim();
    if (!val) { setError("Please enter your email address."); return; }
    if (!val.includes("@")) { setError("Please enter a valid email address."); return; }

    setEmail(val);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: val }),
      });
      const { exists } = await res.json();
      setStep(exists ? "existing-user" : "new-user");
    } catch {
      // fallback: go to sign-in and let them switch if needed
      setStep("existing-user");
    } finally {
      setLoading(false);
    }
  };

  /* ── Sign up ── */
  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) { setError("Please enter a valid 10-digit mobile number."); return; }
    if (!addressLine1.trim()) { setError("Please enter your street address."); return; }
    if (!city.trim()) { setError("Please enter your city."); return; }
    if (!addressState) { setError("Please select your state."); return; }
    if (!/^\d{6}$/.test(pincode)) { setError("Please enter a valid 6-digit PIN code."); return; }
    if (!email || !password) { setError("Please fill in all fields."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setLoading(true);

    // Check if this phone was used on a previously deleted account
    const phoneCheck = await fetch("/api/auth/check-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.replace(/\D/g, "") }),
    });
    if (phoneCheck.ok) {
      const { exists } = await phoneCheck.json();
      if (exists) {
        setLoading(false);
        setError("This mobile number is already linked to a Nutravoe account.");
        return;
      }
    }
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, phone },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    // Sign them in immediately (email confirmation disabled in Supabase dashboard)
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !signInData.user) {
      setLoading(false);
      setError("Account created! Please sign in.");
      setStep("existing-user");
      return;
    }

    // Save phone, first login timestamp, and insert default address
    await Promise.all([
      supabase.from("users").update({ phone, last_login_at: new Date().toISOString() }).eq("id", signInData.user.id),
      supabase.from("addresses").insert({
        user_id: signInData.user.id,
        label: "Home",
        line1: addressLine1.trim(),
        line2: addressLine2.trim() || null,
        city: city.trim(),
        state: addressState,
        pincode: pincode.trim(),
        is_default: true,
        ...(showMap && pinLat && pinLng ? { lat: pinLat, lng: pinLng } : {}),
      }),
    ]);

    setLoading(false);
    setIsNewUser(true);
    setStep("success");
  };

  /* ── Sign in ── */
  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
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

    // Update last login timestamp
    if (signInData.user) {
      await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", signInData.user.id);
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
    <div className="min-h-[calc(100vh-64px)] pt-24 pb-16 px-6 bg-[#F9F8F6] flex flex-col items-center justify-center">
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

                {error && <p id="identifier-error" role="alert" className="font-body text-[12px] text-terracotta">{error}</p>}

                <button type="submit" disabled={loading} className="w-full bg-sage hover:bg-sage-dark disabled:opacity-50 text-white font-body text-sm font-medium py-3 rounded-md transition-colors shadow-sm mt-2">
                  {loading ? "Checking…" : "Continue"}
                </button>
              </form>

              <p className="font-body text-[11px] text-stone mt-6 text-center leading-relaxed">
                By continuing, you agree to Nutravoe&apos;s{" "}
                <Link href="/terms" className="underline hover:text-ink">Conditions of Use</Link> and{" "}
                <Link href="/privacy" className="underline hover:text-ink">Privacy Notice</Link>.
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
                    <label htmlFor="signin-password" className="block font-body text-[13px] font-medium text-ink">Password</label>
                    <button type="button" onClick={handleForgotPassword} className="font-body text-[12px] text-sage hover:underline">
                      Forgot Password?
                    </button>
                  </div>
                  <input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    autoFocus
                    required
                    aria-describedby={error ? "signin-error" : undefined}
                  />
                </div>

                {error && <p id="signin-error" role="alert" className="font-body text-[12px] text-terracotta">{error}</p>}

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
                  <label htmlFor="signup-name" className="block font-body text-[13px] font-medium text-ink mb-1.5">Your Name</label>
                  <input
                    id="signup-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="signup-phone" className="block font-body text-[13px] font-medium text-ink mb-1.5">Mobile Number</label>
                  <input
                    id="signup-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit mobile number"
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    required
                  />
                </div>

                {/* Address section */}
                <div className="pt-1">
                  <p className="font-body text-[12px] font-semibold text-stone uppercase tracking-widest mb-3">Delivery Address</p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <label htmlFor="signup-address-line1" className="block font-body text-[13px] font-medium text-ink mb-1.5">Street / Flat / Building</label>
                      <input
                        id="signup-address-line1"
                        type="text"
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        placeholder="e.g. 12A, Green Apartments, MG Road"
                        className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="signup-address-line2" className="block font-body text-[13px] font-medium text-ink mb-1.5">Landmark <span className="text-stone font-normal">(optional)</span></label>
                      <input
                        id="signup-address-line2"
                        type="text"
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                        placeholder="e.g. Near City Mall"
                        className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="signup-city" className="block font-body text-[13px] font-medium text-ink mb-1.5">City</label>
                        <input
                          id="signup-city"
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="e.g. Bengaluru"
                          className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="signup-pincode" className="block font-body text-[13px] font-medium text-ink mb-1.5">PIN Code</label>
                        <input
                          id="signup-pincode"
                          type="text"
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="6 digits"
                          className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="signup-state" className="block font-body text-[13px] font-medium text-ink mb-1.5">State</label>
                      <select
                        id="signup-state"
                        value={addressState}
                        onChange={(e) => setAddressState(e.target.value)}
                        className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all bg-white text-ink"
                        required
                      >
                        <option value="">Select state…</option>
                        {["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    {/* Optional map pin */}
                    <div className="border border-dashed border-black/15 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowMap((v) => !v)}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-black/[0.02] transition-colors"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sage shrink-0">
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span className="font-body text-[13px] text-ink font-medium">
                          Pin your exact location
                        </span>
                        <span className="font-body text-[11px] text-stone ml-1">(optional — helps with delivery)</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`ml-auto text-stone transition-transform ${showMap ? "rotate-180" : ""}`}>
                          <path d="m6 9 6 6 6-6"/>
                        </svg>
                      </button>
                      {showMap && (
                        <div className="px-4 pb-4">
                          <p className="font-body text-[12px] text-stone mb-3">
                            Drag the pin or tap the map to mark your exact gate or building entrance.
                          </p>
                          <MapPicker
                            centerLat={mapCenter?.lat}
                            centerLng={mapCenter?.lng}
                            onChange={(lat, lng) => { setPinLat(lat); setPinLng(lng); }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-email" className="block font-body text-[13px] font-medium text-ink mb-1.5">Email</label>
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="signup-password" className="block font-body text-[13px] font-medium text-ink mb-1.5">Password</label>
                  <input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all"
                    required
                    minLength={8}
                    aria-describedby={error ? "signup-error" : undefined}
                  />
                </div>

                {error && <p id="signup-error" role="alert" className="font-body text-[12px] text-terracotta">{error}</p>}

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

          {/* CHURNED — previously deleted account */}
          {false && (
            <div className="animate-in fade-in duration-300">
              <div className="flex items-center justify-center w-12 h-12 bg-terracotta/10 rounded-full text-terracotta mb-4 mx-auto">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
                </svg>
              </div>
              <h1 className="font-display text-[26px] font-medium text-ink mb-2 text-center leading-tight">
                This account was deleted
              </h1>
              <p className="font-body text-[14px] text-stone mb-4 text-center leading-relaxed px-2">
                The email <span className="font-semibold text-ink">{identifier}</span> belongs to a previously deleted Nutravoe account.
              </p>
              <div className="bg-[#F9F8F6] border border-black/5 rounded-lg p-4 mb-6">
                <p className="font-body text-[13px] text-ink/80 leading-relaxed">
                  You can <span className="font-semibold">sign up fresh</span> using this email — your old data will not be restored. If you deleted your account by mistake, please contact us within 30 days to request a reactivation.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setStep("new-user"); setError(""); }}
                  className="w-full bg-terracotta hover:bg-[#D55F43] text-white font-body text-sm font-medium py-3 rounded-md transition-colors shadow-sm"
                >
                  Sign Up Fresh with This Email
                </button>
                <button
                  onClick={() => { setStep("identifier"); setIdentifier(""); setError(""); }}
                  className="w-full bg-black/5 hover:bg-black/10 text-ink font-body text-sm font-medium py-3 rounded-md transition-colors"
                >
                  Use a Different Email
                </button>
              </div>
              <p className="font-body text-[11px] text-stone mt-6 text-center">
                Need help? Contact us on <a href="/help" className="underline hover:text-ink">WhatsApp</a>
              </p>
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
            Need help? Contact us on <a href="/help" className="underline hover:text-ink">WhatsApp</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
