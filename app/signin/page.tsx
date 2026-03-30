"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// Mock DB helpers for local demonstration without Supabase
const getUsers = () => {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem("nutravoe_users");
  return stored ? JSON.parse(stored) : [];
};

const saveUser = (user: any) => {
  const users = getUsers();
  users.push(user);
  localStorage.setItem("nutravoe_users", JSON.stringify(users));
};

const setCurrentUser = (user: any) => {
  localStorage.setItem("nutravoe_currentUser", JSON.stringify({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone
  }));
  // Dispatch a storage event so Navbar can pick it up immediately
  window.dispatchEvent(new Event("auth_change"));
};

type Step = "identifier" | "new-user" | "otp" | "existing-user" | "success";

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("identifier");
  const [isNewUser, setIsNewUser] = useState(false);
  
  // Generic identifier (could be email or phone)
  const [identifier, setIdentifier] = useState("");
  
  // Specific form fields
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  
  const [error, setError] = useState("");

  const handleIdentifierSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!identifier.trim()) {
      setError("Please enter a valid email or phone number.");
      return;
    }
    
    // Check if user exists in our local storage mock DB
    const users = getUsers();
    const existingUser = users.find(
      (u: any) => u.email === identifier.trim() || u.phone === identifier.trim()
    );
    
    if (existingUser) {
      setStep("existing-user");
    } else {
      // Pre-fill fields based on what they initially typed to save time
      if (identifier.includes("@")) {
        setEmail(identifier.trim());
      } else {
        setPhone(identifier.replace(/\D/g, ""));
      }
      setStep("new-user");
    }
  };

  useEffect(() => {
    if (step === "success") {
      const timer = setTimeout(() => {
        router.push("/");
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [step, router]);

  const handleNewUserSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name || !password || !phone || !email) {
      setError("Please fill in all required fields.");
      return;
    }
    setError("");
    setStep("otp");
  };

  const handleOtpVerify = (e: FormEvent) => {
    e.preventDefault();
    // Use 1234 as a global bypass/mock for the OTP
    if (otp !== "1234") {
      setError("Invalid OTP code. Please enter 1234 for testing.");
      return;
    }
    
    // Success: Create and login user
    const newUser = { 
      id: Date.now().toString(), 
      name, 
      email: email || `${phone}@placeholder.nutravoe.in`, 
      phone, 
      password 
    };
    saveUser(newUser);
    setCurrentUser(newUser);
    setIsNewUser(true);
    setStep("success");
  };

  const handleLoginSubmit = (e: FormEvent) => {
    e.preventDefault();
    const users = getUsers();
    const user = users.find(
      (u: any) => 
        (u.email === identifier.trim() || u.phone === identifier.trim()) && 
        u.password === password
    );
    
    if (user) {
      setCurrentUser(user);
      setIsNewUser(false);
      setStep("success");
    } else {
      setError("The password you entered is incorrect.");
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] pt-24 pb-16 px-6 bg-[#F9F8F6] flex flex-col items-center justify-center">
      {/* Brand Logo Header */}
      <Link href="/" className="mb-8">
        <div className="relative w-12 h-12">
          <Image
            src="/circular-logo-print-2400px.png"
            alt="Nutravoe"
            fill
            className="object-contain"
          />
        </div>
      </Link>

      {/* Main Auth Card */}
      <div className="w-full max-w-md bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-ink/5 overflow-hidden">
        <div className="p-8 md:p-10">
          
          {/* STEP 1: INITIAL IDENTIFIER */}
          {step === "identifier" && (
            <div className="animate-in fade-in duration-300">
              <h1 className="font-display text-[28px] font-medium text-ink mb-2 leading-tight">
                Sign in or create account
              </h1>
              <p className="font-body text-[14px] text-stone mb-8">
                Enter your mobile number or email address to get started.
              </p>

              <form onSubmit={handleIdentifierSubmit} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="identifier" className="block font-body text-[13px] font-medium text-ink mb-1.5">
                    Email or mobile phone number
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm focus:outline-none focus:border-sage focus:ring-1 focus:ring-sage transition-all"
                    autoFocus
                  />
                </div>

                {error && <p className="font-body text-[12px] text-terracotta">{error}</p>}

                <button type="submit" className="w-full bg-sage hover:bg-sage-dark text-white font-body text-sm font-medium py-3 rounded-md transition-colors shadow-sm mt-2">
                  Continue
                </button>
              </form>
              
              <p className="font-body text-[11px] text-stone mt-6 text-center leading-relaxed">
                By continuing, you agree to Nutravoe's <a href="#" className="underline hover:text-ink">Conditions of Use</a> and <a href="#" className="underline hover:text-ink">Privacy Notice</a>.
              </p>
            </div>
          )}

          {/* STEP 2: NEW USER ONBOARDING */}
          {step === "new-user" && (
            <div className="animate-in zoom-in-95 duration-300">
              <div className="flex items-center justify-center w-12 h-12 bg-sage/10 rounded-full text-sage mb-4 mx-auto">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
              </div>
              <h1 className="font-display text-[28px] font-medium text-ink mb-2 text-center leading-tight">
                Looks like you're new here!
              </h1>
              <p className="font-body text-[13.5px] text-stone mb-8 text-center px-4">
                We're absolutely thrilled to have you. Let's get your account set up for morning deliveries.
              </p>

              <form onSubmit={handleNewUserSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">Your Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all" required />
                </div>
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">Mobile Number</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all" required />
                </div>
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all" required />
                </div>
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all" required minLength={6} />
                </div>

                {error && <p className="font-body text-[12px] text-terracotta">{error}</p>}

                <button type="submit" className="w-full bg-terracotta hover:bg-terracotta/90 text-white font-body text-sm font-medium py-3 rounded-md transition-colors shadow-sm mt-3">
                  Verify Mobile Number
                </button>
                <button type="button" onClick={() => setStep("identifier")} className="font-body text-[12px] text-stone hover:text-ink mt-2">
                  Wait, let me use a different number
                </button>
              </form>
            </div>
          )}

          {/* STEP 3: OTP VERIFICATION */}
          {step === "otp" && (
            <div className="animate-in slide-in-from-right-4 duration-300">
              <h1 className="font-display text-[28px] font-medium text-ink mb-2 leading-tight">
                Verify your number
              </h1>
              <p className="font-body text-[14px] text-stone mb-8">
                We've sent a 4-digit code to <span className="font-bold text-ink">{phone}</span>.
              </p>

              <form onSubmit={handleOtpVerify} className="flex flex-col gap-5">
                <div>
                  <label className="block font-body text-[13px] font-medium text-ink mb-1.5">Enter OTP</label>
                  <input 
                    type="text" 
                    value={otp} 
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} 
                    placeholder="1234" 
                    className="w-full border border-black/20 rounded-md px-4 py-3 font-body text-lg tracking-[0.5em] text-center outline-none focus:border-sage transition-all" 
                    autoFocus
                  />
                  <p className="font-body text-[11px] text-stone/80 mt-2 text-center">For this demo, please use <span className="font-bold">1234</span></p>
                </div>

                {error && <p className="font-body text-[12px] text-terracotta text-center">{error}</p>}

                <button type="submit" className="w-full bg-sage hover:bg-sage-dark text-white font-body text-[14px] font-bold tracking-wide py-3.5 rounded-md transition-colors shadow-sm mt-2">
                  Create Account
                </button>
              </form>
            </div>
          )}

          {/* STEP 4: EXISTING USER LOGIN */}
          {step === "existing-user" && (
            <div className="animate-in fade-in duration-300">
              <h1 className="font-display text-[28px] font-medium text-ink mb-2 leading-tight">
                Sign in
              </h1>
              <div className="flex items-center gap-2 mb-8">
                <span className="font-body text-[14px] text-ink">{identifier}</span>
                <button onClick={() => setStep("identifier")} className="font-body text-[13px] text-sage hover:text-sage-dark font-medium underline">
                  Change
                </button>
              </div>

              <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                <div>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <label className="block font-body text-[13px] font-medium text-ink">Password</label>
                    <button type="button" className="font-body text-[12px] text-sage hover:underline">
                      Forgot Password?
                    </button>
                  </div>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage transition-all" autoFocus required />
                </div>

                {error && <p className="font-body text-[12px] text-terracotta">{error}</p>}

                <button type="submit" className="w-full bg-sage hover:bg-sage-dark text-white font-body text-sm font-medium py-3 rounded-md transition-colors shadow-sm mt-3">
                  Sign In
                </button>
              </form>
            </div>
          )}

          {/* STEP 5: SUCCESS REDIRECT */}
          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-10 text-center animate-in zoom-in-95 fade-in duration-500">
              <div className="w-16 h-16 rounded-full bg-sage/10 flex items-center justify-center text-sage mb-6 ring-1 ring-sage/20 shadow-inner">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <h1 className="font-display text-[32px] font-medium text-ink mb-3 leading-tight tracking-[0.01em]">
                {isNewUser ? "Welcome aboard!" : "Welcome back!"}
              </h1>
              <p className="font-body text-[14px] text-stone mb-2 px-2 leading-relaxed">
                {isNewUser 
                  ? "Your account is ready. Let's get your morning sorted."
                  : "We're so glad to see you again. Taking you to the menu..."}
              </p>
              
              {/* Elegant minimal loading dots */}
              <div className="mt-8 flex gap-2 justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-sage/40 animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-1.5 h-1.5 rounded-full bg-sage/70 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-1.5 h-1.5 rounded-full bg-sage animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
            </div>
          )}

        </div>
        
        {/* Footer of card */}
        <div className="bg-[#F9F8F6]/80 px-8 py-5 border-t border-ink/5 flex justify-center">
          <p className="font-body text-[11px] text-stone">
            Need help? Contact us on <a href="#" className="underline hover:text-ink">WhatsApp</a>
          </p>
        </div>
      </div>
    </main>
  );
}
