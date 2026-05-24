"use client";

import React, { useState, useEffect, useRef, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import MapPicker from "@/components/MapPicker";

type Step = "identifier" | "new-user" | "existing-user" | "forgot-password" | "success";
type SignupStage = 1 | 2 | 3;

const SIGNUP_STAGE_META: Array<{ step: SignupStage; label: string; title: string; description: string }> = [
  {
    step: 1,
    label: "About You",
    title: "Let’s start with you",
    description: "Name and phone first. We’ll use this for delivery updates and account recovery.",
  },
  {
    step: 2,
    label: "Pin Location",
    title: "Where should we deliver?",
    description: "Search or drag the pin to your exact gate or building entrance before continuing.",
  },
  {
    step: 3,
    label: "Address",
    title: "Almost there",
    description: "Add your flat or building number and an optional landmark.",
  },
];

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("identifier");
  const [signupStage, setSignupStage] = useState<SignupStage>(1);
  const [isNewUser, setIsNewUser] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [identifierType, setIdentifierType] = useState<"email" | "phone">("email");
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
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>();
  const [pincodeLookupLoading, setPincodeLookupLoading] = useState(false);
  const [locationLookupLoading, setLocationLookupLoading] = useState(false);
  const [locationLookupError, setLocationLookupError] = useState("");
  const [locationDisplayName, setLocationDisplayName] = useState("");
  const [showResetSuccess, setShowResetSuccess] = useState(false);
  const [isIndianPincode, setIsIndianPincode] = useState<boolean | null>(null);
  const [locationSubStep, setLocationSubStep] = useState<"choose" | "search" | "map">("choose");
  const [locationSearch, setLocationSearch] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ lat: number; lng: number; display_name: string }>>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationGeolocating, setLocationGeolocating] = useState(false);
  const ignoreInitialMapPingRef = useRef(false);
  const suppressPincodeLookupRef = useRef(false);
  const isDesktopViewport = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

  useEffect(() => {
    if (step === "success") {
      const rawNext = searchParams.get("next") ?? "/";
      const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
      const timer = setTimeout(() => router.push(next), 2000);
      return () => clearTimeout(timer);
    }
  }, [step, router, searchParams]);

  useEffect(() => {
    if (step !== "new-user") {
      setSignupStage(1);
      ignoreInitialMapPingRef.current = false;
      suppressPincodeLookupRef.current = false;
    }
  }, [step]);

  useEffect(() => {
    if (pincode.length !== 6) {
      setIsIndianPincode(null);
      return;
    }
    if (suppressPincodeLookupRef.current) {
      suppressPincodeLookupRef.current = false;
      setIsIndianPincode(true);
      return;
    }
    setPincodeLookupLoading(true);
    fetch(`/api/geocode?pincode=${pincode}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.lat && d.lng) {
          setMapCenter({ lat: d.lat, lng: d.lng });
          setPinLat(d.lat);
          setPinLng(d.lng);
          if (typeof d.city === "string") setCity(d.city);
          if (typeof d.state === "string") setAddressState(d.state);
          setIsIndianPincode(true);
        } else {
          setIsIndianPincode(false);
        }
      })
      .catch(() => {
        setIsIndianPincode(false);
      })
      .finally(() => {
        setPincodeLookupLoading(false);
      });
  }, [pincode]);

  useEffect(() => {
    if (step !== "new-user" || signupStage < 2 || pinLat === null || pinLng === null) return;
    let cancelled = false;
    setLocationLookupLoading(true);
    setLocationLookupError("");
    fetch(`/api/geocode?lat=${encodeURIComponent(String(pinLat))}&lng=${encodeURIComponent(String(pinLng))}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok || !data) throw new Error(typeof data?.error === "string" ? data.error : "Could not detect this location.");
        return data as { city?: string; state?: string; pincode?: string; display_name?: string };
      })
      .then((data) => {
        if (cancelled) return;
        suppressPincodeLookupRef.current = true;
        setPincode(typeof data.pincode === "string" ? data.pincode : "");
        setCity(typeof data.city === "string" ? data.city : "");
        setAddressState(typeof data.state === "string" ? data.state : "");
        setIsIndianPincode(typeof data.pincode === "string" && /^\d{6}$/.test(data.pincode));
        if (typeof data.display_name === "string" && data.display_name) {
          setLocationDisplayName(data.display_name);
        }
        if (!(typeof data.pincode === "string" && /^\d{6}$/.test(data.pincode) && data.city && data.state)) {
          setLocationLookupError("We couldn't fully detect the address from this pin. You can continue and complete it manually.");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        suppressPincodeLookupRef.current = true;
        setPincode("");
        setCity("");
        setAddressState("");
        setIsIndianPincode(false);
        setLocationLookupError(err instanceof Error ? err.message : "Could not detect this location.");
      })
      .finally(() => {
        if (!cancelled) setLocationLookupLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, signupStage, pinLat, pinLng]);

  useEffect(() => {
    if (locationSubStep !== "search" || locationSearch.trim().length < 2) {
      setLocationSuggestions([]);
      setLocationSearchLoading(false);
      return;
    }
    setLocationSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(locationSearch)}`);
        const data = await res.json();
        setLocationSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setLocationSuggestions([]);
      }
      setLocationSearchLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [locationSearch, locationSubStep]);

  const handleEnableDeviceLocation = () => {
    setLocationGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMapCenter({ lat, lng });
        setPinLat(lat);
        setPinLng(lng);
        setLocationGeolocating(false);
        setLocationSubStep("map");
      },
      () => {
        setLocationGeolocating(false);
        setLocationSubStep("map");
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleLocationSearchSelect = (s: { lat: number; lng: number; display_name: string }) => {
    setMapCenter({ lat: s.lat, lng: s.lng });
    setPinLat(s.lat);
    setPinLng(s.lng);
    setLocationDisplayName(s.display_name);
    setLocationSubStep("map");
  };

  const enterNewUserFlow = () => {
    setError("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setAddressState("");
    setPincode("");
    setPinLat(null);
    setPinLng(null);
    setMapCenter(undefined);
    setIsIndianPincode(null);
    setLocationLookupError("");
    setLocationLookupLoading(false);
    setLocationDisplayName("");
    setLocationSubStep("choose");
    setLocationSearch("");
    setLocationSuggestions([]);
    setLocationGeolocating(false);
    ignoreInitialMapPingRef.current = false;
    suppressPincodeLookupRef.current = false;
    setSignupStage(1);
    setStep("new-user");
  };

  const validateSignupStage = (stageToValidate: SignupStage, mode: "mobile" | "desktop" = isDesktopViewport() ? "desktop" : "mobile") => {
    if (stageToValidate === 1) {
      if (mode === "desktop") {
        if (!name.trim()) return "Please enter your name.";
        if (!phone.trim() || phone.replace(/\D/g, "").length < 10) return "Please enter a valid 10-digit mobile number.";
        return "";
      }
      if (!name.trim()) return "Please enter your name.";
      if (!phone.trim() || phone.replace(/\D/g, "").length < 10) return "Please enter a valid 10-digit mobile number.";
      if (!email.trim()) return "Please enter your email.";
      if (!password) return "Please enter your password.";
      if (password.length < 8) return "Password must be at least 8 characters.";
      return "";
    }

    if (stageToValidate === 2) {
      if (mode === "desktop") {
        if (!addressLine1.trim()) return "Please enter your street address.";
        if (!/^\d{6}$/.test(pincode)) return "Enter a valid PIN code in India.";
        if (isIndianPincode === false) return "Enter a valid PIN code in India.";
        if (!city.trim()) return "Please enter your city.";
        if (!addressState) return "Please select your state.";
        if (pinLat === null || pinLng === null) return "Pin drop is required to continue.";
        return "";
      }
      if (pinLat === null || pinLng === null) return "Pin drop is required to continue.";
      if (locationLookupLoading) return "We’re identifying this pin. Please wait a moment.";
      return "";
    }

    if (mode === "desktop") {
      if (!email.trim()) return "Please enter your email.";
      if (!password) return "Please enter your password.";
      if (password.length < 8) return "Password must be at least 8 characters.";
      return "";
    }

    if (!addressLine1.trim()) return "Please enter your street address.";
    if (!/^\d{6}$/.test(pincode)) return "Enter a valid PIN code in India.";
    if (isIndianPincode === false) return "Enter a valid PIN code in India.";
    if (!city.trim()) return "Please enter your city.";
    if (!addressState) return "Please select your state.";
    return "";
  };

  const handleSignupStageSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const validationError = validateSignupStage(signupStage);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSignupStage((current) => Math.min(3, current + 1) as SignupStage);
  };

  const handleIdentifierSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const val = identifier.trim();
    if (!val) {
      setError("Please enter your email address or mobile number.");
      return;
    }

    const isEmail = val.includes("@");
    const digits = val.replace(/\D/g, "");
    const isPhone = !isEmail && digits.length === 10;

    if (!isEmail && !isPhone) {
      setError("Please enter a valid email address or 10-digit mobile number.");
      return;
    }

    setLoading(true);

    if (isEmail) {
      setIdentifierType("email");
      setEmail(val);
      try {
        const res = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: val }),
        });
        const { exists } = await res.json();
        if (exists) {
          setStep("existing-user");
        } else {
          enterNewUserFlow();
        }
      } catch {
        setStep("existing-user");
      } finally {
        setLoading(false);
      }
      return;
    }

    setIdentifierType("phone");
    setPhone(digits);
    try {
      const res = await fetch("/api/auth/check-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const data = await res.json();
      if (data.exists && data.email) {
        setEmail(data.email);
        setStep("existing-user");
      } else {
        setEmail("");
        enterNewUserFlow();
      }
    } catch {
      setStep("existing-user");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const mode = isDesktopViewport() ? "desktop" : "mobile";
    const validationError = validateSignupStage(1, mode) || validateSignupStage(2, mode) || validateSignupStage(3, mode);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

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

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !signInData.user) {
      setLoading(false);
      setError("Account created! Please sign in.");
      setStep("existing-user");
      return;
    }

    const bootstrapRes = await fetch("/api/account/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: name,
        phone,
        touch_last_login: true,
        address: {
          line1: addressLine1.trim(),
          line2: addressLine2.trim() || null,
          city: city.trim(),
          state: addressState,
          pincode: pincode.trim(),
          lat: pinLat,
          lng: pinLng,
        },
      }),
    });

    if (!bootstrapRes.ok) {
      setLoading(false);
      setError("Account created, but we couldn't finish setting up your profile. Please try signing in again.");
      return;
    }

    void fetch("/api/auth/send-welcome-self-signup", {
      method: "POST",
      credentials: "include",
    });

    setLoading(false);
    setIsNewUser(true);
    setStep("success");
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      const lowerMessage = signInError.message.toLowerCase();
      if (lowerMessage.includes("ban") || lowerMessage.includes("deactivated")) {
        setError("This account has been deactivated. Please contact support if you need to restore access.");
      } else if (lowerMessage.includes("invalid")) {
        setError("No account found with this email, or the password is incorrect.");
      } else {
        setError(signInError.message);
      }
      return;
    }

    if (signInData.user) {
      await fetch("/api/account/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ touch_last_login: true }),
      });
    }

    setIsNewUser(false);
    setStep("success");
  };

  const handleForgotPassword = () => {
    setError("");
    setStep("forgot-password");
  };

  const handleForgotPasswordDesktop = async () => {
    if (!email.trim()) {
      setError("Enter your email first, then click Forgot Password.");
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setError("");
    alert(`Password reset email sent to ${email.trim()}. Check your inbox.`);
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setShowResetSuccess(true);
  };

  // OSM tile for the Stage 3 location inset (zoom 15 ≈ neighbourhood level)
  const MAP_TILE_Z = 15;
  const mapTileX = pinLng !== null ? Math.floor((pinLng + 180) / 360 * Math.pow(2, MAP_TILE_Z)) : 0;
  const mapTileY = pinLat !== null ? Math.floor((1 - Math.log(Math.tan(pinLat * Math.PI / 180) + 1 / Math.cos(pinLat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, MAP_TILE_Z)) : 0;

  const handleMapConfirm = () => {
    setError("");
    const validationError = validateSignupStage(2);
    if (validationError) { setError(validationError); return; }
    setSignupStage(3);
  };

  // Shared back-button used across all steps
  const BackBtn = ({ onClick }: { onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-black/5 transition-colors text-ink shrink-0"
      aria-label="Go back"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );

  // Shared input style
  const inputCls = "w-full rounded-xl border border-black/15 px-4 py-3 font-body text-[15px] text-ink outline-none transition-all focus:border-sage focus:ring-2 focus:ring-sage/15 bg-white";
  const labelCls = "mb-1.5 block font-body text-[13px] font-medium text-ink";
  const desktopSignupMeta = [
    {
      step: 1 as SignupStage,
      label: "About You",
      title: "Let's start with you",
      description: "Name and phone first. We'll use this for delivery updates and account recovery.",
    },
    {
      step: 2 as SignupStage,
      label: "Delivery",
      title: "Where should we deliver?",
      description: "Add the address and pin your exact location so deliveries reach the right spot.",
    },
    {
      step: 3 as SignupStage,
      label: "Finish setup",
      title: "Secure your account",
      description: "Set your email and password so you can sign in quickly next time.",
    },
  ] as const;
  const currentDesktopSignupMeta = desktopSignupMeta.find((item) => item.step === signupStage)!;

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>

      {/* ── IDENTIFIER ── */}
      {step === "identifier" && (
        <>
          <div className="flex-none flex items-center px-5 pt-4 pb-2">
            <Link href="/" aria-label="Back to home" className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-black/5 transition-colors text-ink">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
            <div className="relative h-8 w-8 mb-7">
              <Image src="/Nutravoe Logo.png" alt="Nutravoe" fill className="object-contain" />
            </div>
            <h1 className="font-display text-[34px] font-light leading-[1.1] text-ink mb-2">
              Sign in or<br />create account
            </h1>
            <p className="font-body text-[14px] leading-relaxed text-stone mb-9">
              Enter your email or mobile number to get started.
            </p>

            <form id="identifier-form" onSubmit={handleIdentifierSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="identifier" className={labelCls}>Email or mobile number</label>
                <input
                  id="identifier"
                  type="text"
                  inputMode="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Email or 10-digit mobile"
                  className={inputCls}
                  autoFocus
                  required
                />
              </div>
            </form>

            <p className="mt-7 font-body text-[12px] leading-relaxed text-stone/70">
              By continuing, you agree to Nutravoe&apos;s{" "}
              <Link href="/terms" className="underline hover:text-ink">Conditions of Use</Link> and{" "}
              <Link href="/privacy" className="underline hover:text-ink">Privacy Notice</Link>.
            </p>
          </div>

          <div className="flex-none px-6" style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}>
            {error && <p className="mb-3 font-body text-[12px] text-terracotta" role="alert">{error}</p>}
            <button
              type="submit"
              form="identifier-form"
              disabled={loading}
              className="w-full rounded-xl bg-sage py-4 font-body text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-sage-dark disabled:opacity-50"
            >
              {loading ? "Checking…" : "Continue"}
            </button>
          </div>
        </>
      )}

      {/* ── EXISTING USER / SIGN IN ── */}
      {step === "existing-user" && (
        <>
          <div className="flex-none flex items-center px-5 pt-4 pb-2">
            <BackBtn onClick={() => { setStep("identifier"); setError(""); }} />
          </div>

          <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
            <h1 className="font-display text-[34px] font-light leading-[1.1] text-ink mb-2">
              Welcome back
            </h1>
            <div className="flex items-center gap-2 mb-9">
              <span className="font-body text-[14px] text-stone truncate min-w-0">{identifier}</span>
              <button
                type="button"
                onClick={() => { setStep("identifier"); setError(""); }}
                className="font-body text-[13px] font-medium text-sage hover:underline shrink-0"
              >
                Change
              </button>
            </div>

            <form id="signin-form" onSubmit={handleSignIn} className="flex flex-col gap-5">
              <div>
                <div className="mb-1.5 flex justify-between items-center">
                  <label htmlFor="signin-password" className={labelCls}>Password</label>
                  <button type="button" onClick={handleForgotPassword} className="font-body text-[12px] text-sage hover:underline">
                    Forgot password?
                  </button>
                </div>
                <input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                  autoFocus
                  required
                />
              </div>
            </form>
          </div>

          <div className="flex-none px-6" style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}>
            {error && <p className="mb-3 font-body text-[12px] text-terracotta" role="alert">{error}</p>}
            <button
              type="submit"
              form="signin-form"
              disabled={loading}
              className="w-full rounded-xl bg-sage py-4 font-body text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-sage-dark disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => { enterNewUserFlow(); setError(""); }}
              className="mt-3.5 w-full py-1 font-body text-[13px] text-stone hover:text-ink transition-colors text-center"
            >
              New to Nutravoe?{" "}
              <span className="font-medium text-sage">Create an account</span>
            </button>
          </div>
        </>
      )}

      {/* ── FORGOT PASSWORD ── */}
      {step === "forgot-password" && (
        <>
          <div className="flex-none flex items-center px-5 pt-3 pb-0">
            <BackBtn onClick={() => { setStep("existing-user"); setError(""); }} />
          </div>

          <div className="flex-1 overflow-y-auto px-6 pt-2 pb-4">
            <h1 className="font-display text-[26px] font-light leading-[1.15] text-ink mb-1">
              Reset your password
            </h1>
            <p className="font-body text-[13px] text-stone mb-5">
              We&apos;ll send a reset link to your email address.
            </p>
            <form id="forgot-form" onSubmit={handleForgotPasswordSubmit} className="flex flex-col gap-3">
              <div>
                <label htmlFor="forgot-email" className={labelCls}>Email address</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className={inputCls}
                  autoFocus
                  required
                />
              </div>
            </form>
          </div>

          <div className="flex-none px-6" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
            {error && <p className="mb-2 font-body text-[12px] text-terracotta" role="alert">{error}</p>}
            <button
              type="submit"
              form="forgot-form"
              disabled={loading}
              className="w-full rounded-xl bg-sage py-3 font-body text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-sage-dark disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </div>
        </>
      )}

      {/* ── RESET SUCCESS POPUP ── */}
      {showResetSuccess && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={() => { setShowResetSuccess(false); setStep("existing-user"); }}
        >
          <div
            className="w-full bg-white rounded-t-3xl px-6 pt-7 pb-safe animate-in slide-in-from-bottom duration-300"
            style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="flex justify-center mb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sage/10">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-sage">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
            </div>
            <h3 className="font-display text-[24px] font-light text-center text-ink mb-2">
              Check your inbox
            </h3>
            <p className="font-body text-[14px] text-center text-stone leading-relaxed mb-1">
              We&apos;ve sent a password reset link to
            </p>
            <p className="font-body text-[14px] text-center font-semibold text-ink mb-4">
              {email}
            </p>
            <p className="font-body text-[13px] text-center text-stone/70 leading-relaxed mb-7">
              Didn&apos;t receive it? Check your <strong className="text-stone">spam or junk folder</strong>. The link expires in 24 hours.
            </p>
            <button
              type="button"
              onClick={() => { setShowResetSuccess(false); setStep("existing-user"); }}
              className="w-full rounded-xl bg-sage py-3 font-body text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-sage-dark"
            >
              Back to sign in
            </button>
          </div>
        </div>
      )}

      {/* ── NEW USER STAGE 1 — About You ── */}
      {step === "new-user" && signupStage === 1 && (
        <>
          <div className="flex-none flex items-center px-5 pt-3 pb-0">
            <BackBtn onClick={() => { setStep("identifier"); setError(""); }} />
          </div>

          <div className="flex-1 overflow-y-auto px-6 pt-2 pb-4">
            <h1 className="font-display text-[26px] font-light leading-[1.15] text-ink mb-1">
              Create your account
            </h1>
            <p className="font-body text-[13px] text-stone mb-5">
              Tell us a little about yourself.
            </p>

            <form id="stage1-form" onSubmit={handleSignupStageSubmit} className="flex flex-col gap-3">
              <div>
                <label htmlFor="signup-name" className={labelCls}>Your name</label>
                <input
                  id="signup-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className={inputCls}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-phone" className={labelCls}>Mobile number</label>
                <input
                  id="signup-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile"
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-email" className={labelCls}>Email</label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-password" className={labelCls}>Password</label>
                <input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={inputCls}
                  required
                  minLength={8}
                />
              </div>
            </form>
          </div>

          <div className="flex-none px-6" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
            {error && <p className="mb-2 font-body text-[12px] text-terracotta" role="alert">{error}</p>}
            <button
              type="submit"
              form="stage1-form"
              className="w-full rounded-xl bg-sage py-3 font-body text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-sage-dark"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => { setStep("existing-user"); setError(""); }}
              className="mt-2.5 w-full py-1 font-body text-[13px] text-stone hover:text-ink transition-colors text-center"
            >
              Already have an account?{" "}
              <span className="font-medium text-sage">Sign in</span>
            </button>
          </div>
        </>
      )}

      {/* ── NEW USER STAGE 2a — Choose location method ── */}
      {step === "new-user" && signupStage === 2 && locationSubStep === "choose" && (
        <>
          <div className="flex-none flex items-center px-5 pt-3 pb-0">
            <BackBtn onClick={() => { setSignupStage(1); setError(""); }} />
          </div>

          {/* Illustration + heading */}
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div className="w-full max-w-[260px] aspect-square mb-6">
              <svg viewBox="0 0 260 260" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                {/* Background circle */}
                <circle cx="130" cy="130" r="118" fill="#F7F1E8"/>
                {/* Road grid */}
                <line x1="20" y1="130" x2="240" y2="130" stroke="#E0D5C0" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="130" y1="20" x2="130" y2="240" stroke="#E0D5C0" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="55" y1="55" x2="205" y2="205" stroke="#E8DFC8" strokeWidth="1.5" strokeDasharray="3 8"/>
                <line x1="205" y1="55" x2="55" y2="205" stroke="#E8DFC8" strokeWidth="1.5" strokeDasharray="3 8"/>
                {/* Pulse rings */}
                <circle cx="130" cy="135" r="78" stroke="#C4A574" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="4 6"/>
                <circle cx="130" cy="135" r="52" stroke="#C4A574" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 4"/>
                <circle cx="130" cy="135" r="26" stroke="#C4A574" strokeOpacity="0.4" strokeWidth="2"/>
                {/* Pin shadow */}
                <ellipse cx="130" cy="148" rx="16" ry="5" fill="#C4A574" fillOpacity="0.2"/>
                {/* Pin body */}
                <path d="M130 60 C112 60 98 74 98 92 C98 114 130 148 130 148 C130 148 162 114 162 92 C162 74 148 60 130 60Z" fill="#C4A574"/>
                <circle cx="130" cy="92" r="14" fill="white"/>
                <circle cx="130" cy="92" r="5" fill="#C4A574"/>
                {/* Building left */}
                <rect x="48" y="148" width="28" height="42" rx="3" fill="#E8DFCF"/>
                <rect x="48" y="148" width="28" height="8" rx="3" fill="#DDD1BC"/>
                <rect x="54" y="161" width="6" height="6" rx="1" fill="#C4A574" fillOpacity="0.3"/>
                <rect x="64" y="161" width="6" height="6" rx="1" fill="#C4A574" fillOpacity="0.3"/>
                <rect x="54" y="173" width="6" height="6" rx="1" fill="#C4A574" fillOpacity="0.3"/>
                <rect x="64" y="173" width="6" height="6" rx="1" fill="#C4A574" fillOpacity="0.3"/>
                {/* Building top-left */}
                <rect x="52" y="86" width="22" height="38" rx="2" fill="#EDE6D6"/>
                <rect x="57" y="93" width="5" height="6" rx="1" fill="#C4A574" fillOpacity="0.25"/>
                <rect x="64" y="93" width="5" height="6" rx="1" fill="#C4A574" fillOpacity="0.25"/>
                <rect x="57" y="103" width="5" height="6" rx="1" fill="#C4A574" fillOpacity="0.25"/>
                <rect x="64" y="103" width="5" height="6" rx="1" fill="#C4A574" fillOpacity="0.25"/>
                {/* Building right */}
                <rect x="183" y="150" width="34" height="38" rx="3" fill="#E8DFCF"/>
                <rect x="183" y="150" width="34" height="9" rx="3" fill="#DDD1BC"/>
                <rect x="189" y="164" width="7" height="7" rx="1" fill="#C4A574" fillOpacity="0.3"/>
                <rect x="200" y="164" width="7" height="7" rx="1" fill="#C4A574" fillOpacity="0.3"/>
                {/* Trees */}
                <circle cx="178" cy="84" r="10" fill="#B5C9A0" fillOpacity="0.7"/>
                <rect x="177" y="93" width="2" height="8" fill="#8BA878" fillOpacity="0.5"/>
                <circle cx="78" cy="153" r="8" fill="#B5C9A0" fillOpacity="0.6"/>
                <rect x="77" y="160" width="2" height="7" fill="#8BA878" fillOpacity="0.5"/>
              </svg>
            </div>
            <h1 className="font-display text-[28px] font-light text-center leading-[1.2] text-ink mb-2">
              Where should<br />we deliver?
            </h1>
            <p className="font-body text-[14px] text-center text-stone">
              Set your delivery location to get started.
            </p>
          </div>

          <div className="flex-none px-6 flex flex-col gap-3" style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}>
            <button
              type="button"
              onClick={handleEnableDeviceLocation}
              disabled={locationGeolocating}
              className="w-full rounded-xl bg-sage py-3.5 font-body text-[15px] font-medium text-white flex items-center justify-center gap-2.5 shadow-sm transition-colors hover:bg-sage-dark disabled:opacity-70"
            >
              {locationGeolocating ? (
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                  <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" fillOpacity="0"/>
                </svg>
              )}
              {locationGeolocating ? "Detecting location…" : "Enable device location"}
            </button>
            <button
              type="button"
              onClick={() => { setLocationSearch(""); setLocationSuggestions([]); setLocationSubStep("search"); }}
              className="w-full rounded-xl border border-sage py-3.5 font-body text-[15px] font-medium text-sage flex items-center justify-center transition-colors hover:bg-sage/5"
            >
              Enter location manually
            </button>
          </div>
        </>
      )}

      {/* ── NEW USER STAGE 2b — Search location ── */}
      {step === "new-user" && signupStage === 2 && locationSubStep === "search" && (
        <>
          <div className="flex-none flex items-center gap-3 px-5 pt-3 pb-3 border-b border-black/6">
            <BackBtn onClick={() => setLocationSubStep("choose")} />
            <h2 className="font-display text-[22px] font-light text-ink leading-tight">Select a location</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pt-4">
            {/* Search input */}
            <div className="flex items-center gap-3 rounded-xl border border-black/15 bg-white px-4 py-3 mb-3 focus-within:border-sage focus-within:ring-2 focus-within:ring-sage/15 transition-all">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sage shrink-0">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                placeholder="Search for area, street name…"
                className="flex-1 font-body text-[15px] text-ink outline-none bg-transparent placeholder:text-stone/60"
                autoFocus
              />
              {locationSearchLoading && (
                <svg className="animate-spin shrink-0 text-stone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              )}
              {locationSearch && !locationSearchLoading && (
                <button type="button" onClick={() => { setLocationSearch(""); setLocationSuggestions([]); }} className="shrink-0 text-stone hover:text-ink">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>

            {/* Use current location row */}
            <button
              type="button"
              onClick={handleEnableDeviceLocation}
              disabled={locationGeolocating}
              className="w-full flex items-center gap-3 rounded-xl border border-black/8 bg-white px-4 py-3.5 mb-5 transition-colors hover:bg-black/[0.02] disabled:opacity-70"
            >
              {locationGeolocating ? (
                <svg className="animate-spin text-sage shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sage shrink-0">
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                </svg>
              )}
              <span className="flex-1 text-left font-body text-[14px] font-medium text-sage">
                {locationGeolocating ? "Detecting location…" : "Use your current location"}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-stone shrink-0">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </button>

            {/* Suggestions */}
            {locationSuggestions.length > 0 && (
              <div className="flex flex-col divide-y divide-black/6 rounded-xl border border-black/8 overflow-hidden">
                {locationSuggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleLocationSearchSelect(s)}
                    className="flex items-start gap-3 px-4 py-3.5 text-left bg-white hover:bg-black/[0.02] transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-stone shrink-0 mt-0.5">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                    <span className="font-body text-[13px] text-ink leading-snug">{s.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── NEW USER STAGE 2c — Map / Pin Location ── */}
      {step === "new-user" && signupStage === 2 && locationSubStep === "map" && (
        <>
          <div className="flex-none flex items-center gap-3 px-5 pt-4 pb-3 border-b border-black/6">
            <BackBtn onClick={() => { setLocationSubStep("choose"); setError(""); }} />
            <h2 className="font-display text-[22px] font-light text-ink leading-tight">
              Confirm your location
            </h2>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <MapPicker
              fullscreen
              centerLat={mapCenter?.lat}
              centerLng={mapCenter?.lng}
              onAddressSelect={(name) => setLocationDisplayName(name)}
              onChange={(lat, lng) => {
                if (!ignoreInitialMapPingRef.current && mapCenter === undefined && pinLat === null && pinLng === null) {
                  ignoreInitialMapPingRef.current = true;
                  return;
                }
                setPinLat(lat);
                setPinLng(lng);
              }}
            />
          </div>

          <div className="flex-none bg-white border-t border-black/8 px-5 pt-4" style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}>
            {pinLat === null ? (
              <p className="py-1 text-center font-body text-[13px] text-stone">
                Tap the map or search to set your delivery pin
              </p>
            ) : !locationLookupLoading ? (
              <>
                {(locationDisplayName || pincode || city || addressState) && (
                  <div className="mb-4">
                    <p className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-sage mb-2">
                      Dropping pin at
                    </p>
                    <div className="flex items-start gap-2.5">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-sage shrink-0 mt-0.5">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                      </svg>
                      <div className="min-w-0">
                        {locationDisplayName ? (
                          <p className="font-body text-[15px] font-semibold text-ink leading-snug line-clamp-2">
                            {locationDisplayName}
                          </p>
                        ) : (
                          <>
                            <p className="font-body text-[17px] font-semibold text-ink leading-tight">
                              {city || "Your location"}
                            </p>
                            {(addressState || pincode) && (
                              <p className="font-body text-[13px] text-stone mt-0.5">
                                {[addressState, pincode].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {locationLookupError && (
                      <p className="mt-2 font-body text-[11px] text-terracotta">{locationLookupError}</p>
                    )}
                  </div>
                )}
                {error && <p className="mb-3 font-body text-[12px] text-terracotta" role="alert">{error}</p>}
                <button
                  type="button"
                  onClick={handleMapConfirm}
                  className="w-full rounded-xl bg-sage py-4 font-body text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-sage-dark"
                >
                  Confirm location
                </button>
              </>
            ) : null}
          </div>
        </>
      )}

      {/* ── NEW USER STAGE 3 — Address ── */}
      {step === "new-user" && signupStage === 3 && (
        <>
          <div className="flex-none flex items-center px-5 pt-3 pb-0">
            <BackBtn onClick={() => { setSignupStage(2); setError(""); }} />
          </div>

          <div className="flex-1 overflow-y-auto px-6 pt-2 pb-4">
            <h1 className="font-display text-[26px] font-light leading-[1.15] text-ink mb-1">
              Your delivery address
            </h1>
            <p className="font-body text-[13px] text-stone mb-4">
              Add your flat or building to complete the address.
            </p>

            {/* Location inset */}
            {pinLat !== null && pinLng !== null && (
              <div className="flex items-start gap-3 rounded-2xl border border-black/8 bg-[#F9F8F6] p-3 mb-4">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-beige">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://tile.openstreetmap.org/${MAP_TILE_Z}/${mapTileX}/${mapTileY}.png`}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    draggable={false}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-sage shadow-sm" />
                  </div>
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="font-body text-[11px] text-ink leading-snug line-clamp-4">
                    {locationDisplayName || city || "Your location"}
                  </p>
                  {!locationDisplayName && (addressState || pincode) && (
                    <p className="mt-0.5 font-body text-[11px] text-stone">
                      {[addressState, pincode].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setSignupStage(2); setLocationSubStep(pinLat !== null ? "map" : "choose"); setError(""); }}
                  className="flex shrink-0 items-center gap-0.5 font-body text-[12px] font-medium text-sage transition-colors hover:text-sage-dark mt-0.5"
                >
                  Change
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}

            <form id="stage3-form" onSubmit={handleSignUp} className="flex flex-col gap-3">
              <div>
                <label htmlFor="signup-address-line1" className={labelCls}>Address details</label>
                <input
                  id="signup-address-line1"
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Floor, flat, building, street"
                  className={inputCls}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label htmlFor="signup-address-line2" className={labelCls}>
                  Landmark <span className="font-normal text-stone">(optional)</span>
                </label>
                <input
                  id="signup-address-line2"
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="e.g. Near City Mall"
                  className={inputCls}
                />
              </div>
            </form>
          </div>

          <div className="flex-none px-6" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
            {error && <p className="mb-2 font-body text-[12px] text-terracotta" role="alert">{error}</p>}
            <button
              type="submit"
              form="stage3-form"
              disabled={loading || pincodeLookupLoading}
              className="w-full rounded-xl bg-sage py-3 font-body text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-sage-dark disabled:opacity-50"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </div>
        </>
      )}

      {/* ── SUCCESS ── */}
      {step === "success" && (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center animate-in fade-in zoom-in-95 duration-500">
          <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10 text-sage ring-1 ring-sage/20">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="font-display text-[36px] font-light leading-tight text-ink mb-3">
            {isNewUser ? "Welcome aboard!" : "Welcome back!"}
          </h1>
          <p className="font-body text-[14px] leading-relaxed text-stone">
            {isNewUser
              ? "Your account is ready. Let's find your perfect bowl."
              : "We're so glad to see you again. Taking you to the menu…"}
          </p>
          <div className="mt-10 flex justify-center gap-2">
            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-sage/40" style={{ animationDelay: "0ms" }} />
            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-sage/70" style={{ animationDelay: "150ms" }} />
            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-sage" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      )}
      </div>

      <div className="hidden min-h-[calc(100vh-64px)] flex-col items-center justify-start bg-cream px-4 pb-10 pt-18 md:flex md:justify-center md:px-6 md:pb-16 md:pt-24">
        <Link href="/" className="mb-5 md:mb-6">
          <div className="relative h-10 w-10 md:h-12 md:w-12">
            <Image src="/Nutravoe Logo.png" alt="Nutravoe" fill className="object-contain" />
          </div>
        </Link>

        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-ink/5 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:rounded-xl">
          <div className="p-4 md:p-10">
            {step === "identifier" && (
              <div className="animate-in fade-in duration-300">
                <h1 className="mb-2 font-display text-[22px] font-medium leading-tight text-ink md:text-[28px]">
                  Sign in or create account
                </h1>
                <p className="mb-5 font-body text-[12px] leading-relaxed text-stone md:mb-8 md:text-[14px]">
                  Enter your email address or mobile number to get started.
                </p>

                <form onSubmit={handleIdentifierSubmit} className="flex flex-col gap-3 md:gap-4">
                  <div>
                    <label htmlFor="desktop-identifier" className="mb-1.5 block font-body text-[13px] font-medium text-ink">
                      Email or mobile number
                    </label>
                    <input
                      id="desktop-identifier"
                      type="text"
                      inputMode="email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Email address or 10-digit mobile number"
                      className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm transition-all focus:border-sage focus:outline-none focus:ring-1 focus:ring-sage"
                      autoFocus
                      required
                    />
                  </div>

                  {error ? <p id="desktop-identifier-error" role="alert" className="font-body text-[12px] text-terracotta">{error}</p> : null}

                  <button type="submit" disabled={loading} className="mt-1 w-full rounded-md bg-sage py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sage-dark disabled:opacity-50">
                    {loading ? "Checking..." : "Continue"}
                  </button>
                </form>

                <p className="mt-5 text-center font-body text-[10.5px] leading-relaxed text-stone md:mt-6 md:text-[11px]">
                  By continuing, you agree to Nutravoe&apos;s{" "}
                  <Link href="/terms" className="underline hover:text-ink">Conditions of Use</Link> and{" "}
                  <Link href="/privacy" className="underline hover:text-ink">Privacy Notice</Link>.
                </p>
              </div>
            )}

            {step === "existing-user" && (
              <div className="animate-in fade-in duration-300">
                <h1 className="mb-2 font-display text-[22px] font-medium leading-tight text-ink md:text-[28px]">
                  Sign in
                </h1>
                <div className="mb-6 flex items-center gap-2 md:mb-8">
                  <span className="min-w-0 truncate font-body text-[13px] text-ink md:text-[14px]">{identifier}</span>
                  <button onClick={() => { setStep("identifier"); setError(""); }} className="font-body text-[12px] font-medium text-sage underline hover:text-sage-dark">
                    Change
                  </button>
                </div>

                <form onSubmit={handleSignIn} className="flex flex-col gap-3 md:gap-4">
                  <div>
                    <div className="mb-1.5 flex justify-between">
                      <label htmlFor="desktop-signin-password" className="block font-body text-[13px] font-medium text-ink">Password</label>
                      <button type="button" onClick={handleForgotPasswordDesktop} className="font-body text-[12px] text-sage hover:underline">
                        Forgot Password?
                      </button>
                    </div>
                    <input
                      id="desktop-signin-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                      autoFocus
                      required
                      aria-describedby={error ? "desktop-signin-error" : undefined}
                    />
                  </div>

                  {error ? <p id="desktop-signin-error" role="alert" className="font-body text-[12px] text-terracotta">{error}</p> : null}

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-2 w-full rounded-md bg-sage py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sage-dark disabled:opacity-50"
                  >
                    {loading ? "Signing in..." : "Sign In"}
                  </button>
                </form>

                <div className="mt-5 border-t border-ink/5 pt-5 text-center md:mt-6 md:pt-6">
                  <p className="font-body text-[13px] text-stone">
                    New to Nutravoe?{" "}
                    <button
                      onClick={() => {
                        setError("");
                        setSignupStage(1);
                        setStep("new-user");
                      }}
                      className="font-medium text-sage hover:underline"
                    >
                      Create an account
                    </button>
                  </p>
                </div>
              </div>
            )}

            {step === "new-user" && (
              <div className="animate-in fade-in duration-300">
                <div className="mb-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-body text-[10px] font-bold uppercase tracking-[0.18em] text-stone">
                      Step {signupStage} of {desktopSignupMeta.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (signupStage === 1) {
                          setStep("identifier");
                        } else {
                          setSignupStage((current) => Math.max(1, current - 1) as SignupStage);
                        }
                        setError("");
                      }}
                      className="font-body text-[12px] font-medium text-stone hover:text-ink"
                    >
                      {signupStage === 1 ? "Back" : "Previous"}
                    </button>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/6">
                    <div className="h-full rounded-full bg-sage transition-all duration-300" style={{ width: `${(signupStage / desktopSignupMeta.length) * 100}%` }} />
                  </div>
                  <div className="mt-3 flex justify-between gap-2">
                    {desktopSignupMeta.map((item) => (
                      <div key={item.step} className="min-w-0 flex-1">
                        <p className={`font-body text-[10px] font-bold uppercase tracking-[0.12em] ${item.step === signupStage ? "text-ink" : "text-stone/55"}`}>
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-sage/10 text-sage md:h-12 md:w-12">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" x2="19" y1="8" y2="14" />
                    <line x1="22" x2="16" y1="11" y2="11" />
                  </svg>
                </div>
                <h1 className="mb-2 text-center font-display text-[22px] font-medium leading-tight text-ink md:text-[28px]">
                  {currentDesktopSignupMeta.title}
                </h1>
                <p className="mb-5 px-1 text-center font-body text-[12px] leading-relaxed text-stone md:mb-8 md:px-4 md:text-[13.5px]">
                  {currentDesktopSignupMeta.description}
                </p>

                <form onSubmit={signupStage === 3 ? handleSignUp : handleSignupStageSubmit} className="flex flex-col gap-3 md:gap-4">
                  {signupStage === 1 && (
                    <>
                      <div>
                        <label htmlFor="desktop-signup-name" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Your Name</label>
                        <input
                          id="desktop-signup-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                          autoFocus
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="desktop-signup-phone" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Mobile Number</label>
                        <input
                          id="desktop-signup-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          placeholder="10-digit mobile number"
                          className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                          required
                        />
                      </div>
                    </>
                  )}

                  {signupStage === 2 && (
                    <div className="rounded-2xl border border-black/6 bg-[#FBFAF8] p-3.5 md:rounded-none md:border-0 md:bg-transparent md:p-0">
                      <p className="mb-3 font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-stone md:text-[12px] md:tracking-widest">Delivery Address</p>
                      <div className="flex flex-col gap-3">
                        <div>
                          <label htmlFor="desktop-signup-address-line1" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Street / Flat / Building</label>
                          <input
                            id="desktop-signup-address-line1"
                            type="text"
                            value={addressLine1}
                            onChange={(e) => setAddressLine1(e.target.value)}
                            placeholder="e.g. 12A, Green Apartments, MG Road"
                            className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                            autoFocus
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="desktop-signup-address-line2" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Landmark <span className="font-normal text-stone">(optional)</span></label>
                          <input
                            id="desktop-signup-address-line2"
                            type="text"
                            value={addressLine2}
                            onChange={(e) => setAddressLine2(e.target.value)}
                            placeholder="e.g. Near City Mall"
                            className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label htmlFor="desktop-signup-pincode" className="mb-1.5 block font-body text-[13px] font-medium text-ink">PIN Code</label>
                            <input
                              id="desktop-signup-pincode"
                              type="text"
                              value={pincode}
                              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="6 digits"
                              className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                              required
                            />
                            {pincode.length === 6 && isIndianPincode === false ? (
                              <p className="mt-1 font-body text-[11px] text-terracotta">Enter a valid PIN code in India.</p>
                            ) : null}
                          </div>
                          <div>
                            <label htmlFor="desktop-signup-city" className="mb-1.5 block font-body text-[13px] font-medium text-ink">City</label>
                            <input
                              id="desktop-signup-city"
                              type="text"
                              value={city}
                              onChange={(e) => setCity(e.target.value)}
                              placeholder={pincodeLookupLoading ? "Auto-filling..." : "e.g. Bengaluru"}
                              className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="desktop-signup-state" className="mb-1.5 block font-body text-[13px] font-medium text-ink">State</label>
                          <select
                            id="desktop-signup-state"
                            value={addressState}
                            onChange={(e) => setAddressState(e.target.value)}
                            className="w-full rounded-md border border-black/20 bg-white px-3 py-2.5 font-body text-sm text-ink outline-none transition-all focus:border-sage"
                            required
                          >
                            <option value="">Select state...</option>
                            {["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-dashed border-black/15">
                          <div className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-sage">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <span className="font-body text-[13px] font-medium text-ink">
                              Pin your exact location
                            </span>
                            <span className="ml-1 font-body text-[11px] text-terracotta">(required)</span>
                          </div>
                          <div className="px-4 pb-4">
                            <p className="mb-3 font-body text-[11px] leading-relaxed text-stone md:text-[12px]">
                              Drag the pin or tap the map to mark your exact gate or building entrance.
                            </p>
                            <MapPicker
                              centerLat={mapCenter?.lat}
                              centerLng={mapCenter?.lng}
                              onChange={(lat, lng) => { setPinLat(lat); setPinLng(lng); }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {signupStage === 3 && (
                    <>
                      <div>
                        <label htmlFor="desktop-signup-email" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Email</label>
                        <input
                          id="desktop-signup-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                          autoFocus
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="desktop-signup-password" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Password</label>
                        <input
                          id="desktop-signup-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                          required
                          minLength={8}
                          aria-describedby={error ? "desktop-signup-error" : undefined}
                        />
                      </div>
                    </>
                  )}

                  {error ? <p id="desktop-signup-error" role="alert" className="font-body text-[12px] text-terracotta">{error}</p> : null}

                  {signupStage < 3 ? (
                    <button
                      type="submit"
                      className="mt-2 w-full rounded-md bg-sage py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sage-dark"
                    >
                      Continue
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-2 w-full rounded-md bg-terracotta py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-terracotta/90 disabled:opacity-50"
                    >
                      {loading ? "Creating account..." : "Create Account"}
                    </button>
                  )}

                  {signupStage === 1 ? (
                    <button
                      type="button"
                      onClick={() => { setStep("existing-user"); setError(""); }}
                      className="mt-0.5 font-body text-[12px] text-stone hover:text-ink"
                    >
                      Already have an account? Sign in
                    </button>
                  ) : null}
                </form>
              </div>
            )}

            {step === "success" && (
              <div className="flex animate-in zoom-in-95 fade-in duration-500 flex-col items-center justify-center py-10 text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage/10 text-sage ring-1 ring-sage/20 shadow-inner">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <h1 className="mb-3 font-display text-[28px] font-medium leading-tight text-ink md:text-[32px]">
                  {isNewUser ? "Welcome aboard!" : "Welcome back!"}
                </h1>
                <p className="mb-2 px-2 font-body text-[14px] leading-relaxed text-stone">
                  {isNewUser
                    ? "Your account is ready. Let's find your perfect bowl."
                    : "We're so glad to see you again. Taking you to the menu..."}
                </p>
                <div className="mt-8 flex justify-center gap-2">
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-sage/40" style={{ animationDelay: "0ms" }} />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-sage/70" style={{ animationDelay: "150ms" }} />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-sage" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
