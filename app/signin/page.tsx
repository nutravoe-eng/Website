"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";

const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false });

type Step = "identifier" | "new-user" | "existing-user" | "success";
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
    label: "Delivery",
    title: "Where should we deliver?",
    description: "Add the address and pin your exact location so deliveries reach the right spot.",
  },
  {
    step: 3,
    label: "Finish setup",
    title: "Secure your account",
    description: "Set your email and password so you can sign in quickly next time.",
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
  const [isIndianPincode, setIsIndianPincode] = useState<boolean | null>(null);

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
    }
  }, [step]);

  useEffect(() => {
    if (pincode.length !== 6) {
      setIsIndianPincode(null);
      setPinLat(null);
      setPinLng(null);
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
          setPinLat(null);
          setPinLng(null);
        }
      })
      .catch(() => {
        setIsIndianPincode(false);
        setPinLat(null);
        setPinLng(null);
      })
      .finally(() => {
        setPincodeLookupLoading(false);
      });
  }, [pincode]);

  const enterNewUserFlow = () => {
    setError("");
    setSignupStage(1);
    setStep("new-user");
  };

  const validateSignupStage = (stageToValidate: SignupStage) => {
    if (stageToValidate === 1) {
      if (!name.trim()) return "Please enter your name.";
      if (!phone.trim() || phone.replace(/\D/g, "").length < 10) return "Please enter a valid 10-digit mobile number.";
      return "";
    }

    if (stageToValidate === 2) {
      if (!addressLine1.trim()) return "Please enter your street address.";
      if (!/^\d{6}$/.test(pincode)) return "Enter a valid PIN code in India.";
      if (isIndianPincode === false) return "Enter a valid PIN code in India.";
      if (!city.trim()) return "Please enter your city.";
      if (!addressState) return "Please select your state.";
      if (pinLat === null || pinLng === null) return "Pin drop is required to continue.";
      return "";
    }

    if (!email) return "Please enter your email.";
    if (!password) return "Please enter your password.";
    if (password.length < 8) return "Password must be at least 8 characters.";
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

    const validationError = validateSignupStage(1) || validateSignupStage(2) || validateSignupStage(3);
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

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Enter your email first, then click Forgot Password.");
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setError("");
    alert(`Password reset email sent to ${email}. Check your inbox.`);
  };

  const currentSignupMeta = SIGNUP_STAGE_META.find((item) => item.step === signupStage)!;
  const progressWidth = `${(signupStage / SIGNUP_STAGE_META.length) * 100}%`;

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-start bg-cream px-4 pb-10 pt-18 md:justify-center md:px-6 md:pb-16 md:pt-24">
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
                  <label htmlFor="identifier" className="mb-1.5 block font-body text-[13px] font-medium text-ink">
                    Email or mobile number
                  </label>
                  <input
                    id="identifier"
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

                {error ? <p id="identifier-error" role="alert" className="font-body text-[12px] text-terracotta">{error}</p> : null}

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
                    className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                    autoFocus
                    required
                    aria-describedby={error ? "signin-error" : undefined}
                  />
                </div>

                {error ? <p id="signin-error" role="alert" className="font-body text-[12px] text-terracotta">{error}</p> : null}

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
                    Step {signupStage} of {SIGNUP_STAGE_META.length}
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
                  <div className="h-full rounded-full bg-sage transition-all duration-300" style={{ width: progressWidth }} />
                </div>
                <div className="mt-3 flex justify-between gap-2">
                  {SIGNUP_STAGE_META.map((item) => (
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
                {currentSignupMeta.title}
              </h1>
              <p className="mb-5 px-1 text-center font-body text-[12px] leading-relaxed text-stone md:mb-8 md:px-4 md:text-[13.5px]">
                {currentSignupMeta.description}
              </p>

              <form onSubmit={signupStage === 3 ? handleSignUp : handleSignupStageSubmit} className="flex flex-col gap-3 md:gap-4">
                {signupStage === 1 && (
                  <>
                    <div>
                      <label htmlFor="signup-name" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Your Name</label>
                      <input
                        id="signup-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                        autoFocus
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="signup-phone" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Mobile Number</label>
                      <input
                        id="signup-phone"
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
                        <label htmlFor="signup-address-line1" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Street / Flat / Building</label>
                        <input
                          id="signup-address-line1"
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
                        <label htmlFor="signup-address-line2" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Landmark <span className="font-normal text-stone">(optional)</span></label>
                        <input
                          id="signup-address-line2"
                          type="text"
                          value={addressLine2}
                          onChange={(e) => setAddressLine2(e.target.value)}
                          placeholder="e.g. Near City Mall"
                          className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label htmlFor="signup-pincode" className="mb-1.5 block font-body text-[13px] font-medium text-ink">PIN Code</label>
                          <input
                            id="signup-pincode"
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
                          <label htmlFor="signup-city" className="mb-1.5 block font-body text-[13px] font-medium text-ink">City</label>
                          <input
                            id="signup-city"
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
                        <label htmlFor="signup-state" className="mb-1.5 block font-body text-[13px] font-medium text-ink">State</label>
                        <select
                          id="signup-state"
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
                      <label htmlFor="signup-email" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Email</label>
                      <input
                        id="signup-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                        autoFocus
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="signup-password" className="mb-1.5 block font-body text-[13px] font-medium text-ink">Password</label>
                      <input
                        id="signup-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="w-full rounded-md border border-black/20 px-3 py-2.5 font-body text-sm outline-none transition-all focus:border-sage"
                        required
                        minLength={8}
                        aria-describedby={error ? "signup-error" : undefined}
                      />
                    </div>
                  </>
                )}

                {error ? <p id="signup-error" role="alert" className="font-body text-[12px] text-terracotta">{error}</p> : null}

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
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
