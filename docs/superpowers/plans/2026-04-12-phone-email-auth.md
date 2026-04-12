# Phone + Email Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to sign in and sign up using either their email address or 10-digit mobile number as the identifier.

**Architecture:** The identifier input auto-detects email vs phone (email if contains `@`, phone if 10 digits after stripping non-digits). For phone sign-in, the API resolves the associated email, which is then used for Supabase email+password auth as normal. No auth layer changes — only the lookup and UI change.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (email+password auth), Tailwind CSS

---

## Files Changed

| File | Change |
|---|---|
| `app/api/auth/check-phone/route.ts` | Also return `email` from `users` table when phone is found |
| `app/signin/page.tsx` | Accept email or phone in identifier step; route each correctly |

---

### Task 1: Update `check-phone` API to return email when found

**Files:**
- Modify: `website/app/api/auth/check-phone/route.ts`

- [ ] **Step 1: Update the DB query to also select `email`**

Replace the existing query (line 19–24) with one that fetches `email` too, and return it in the response when the user exists.

Full updated file:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'auth-check-phone', 5, 60);
  if (!limited.ok) return limited.response;

  const { phone } = await req.json();
  const digits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
  // Take only last 10 digits — strips country codes like +91/91 prefix silently.
  const normalised = digits.slice(-10);

  if (normalised.length !== 10) {
    return NextResponse.json({ error: 'Valid 10-digit phone required' }, { status: 400, headers: limited.headers });
  }

  const { data, error } = await adminSupabase
    .from('users')
    .select('id, email')
    .eq('phone', normalised)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to check phone' }, { status: 500, headers: limited.headers });
  }

  if (!data) {
    return NextResponse.json({ exists: false }, { headers: limited.headers });
  }

  return NextResponse.json({ exists: true, email: data.email }, { headers: limited.headers });
}
```

- [ ] **Step 2: Verify the change looks correct**

Open `website/app/api/auth/check-phone/route.ts` and confirm:
- `select('id, email')` is used (not just `select('id')`)
- When `data` exists, the response includes `email: data.email`
- When `data` is null, the response is `{ exists: false }` with no email field

- [ ] **Step 3: Commit**

```bash
git add website/app/api/auth/check-phone/route.ts
git commit -m "feat: return email from check-phone API when user found"
```

---

### Task 2: Update signin page to accept phone or email as identifier

**Files:**
- Modify: `website/app/signin/page.tsx`

This task has multiple sub-steps. Read the full current file at `website/app/signin/page.tsx` before starting.

- [ ] **Step 1: Add `identifierType` state variable**

In the state declarations block (around line 19–37), add one new state variable after the `identifier` state:

```ts
const [identifierType, setIdentifierType] = useState<"email" | "phone">("email");
```

- [ ] **Step 2: Replace `handleIdentifierSubmit` with a version that handles both phone and email**

Replace the entire `handleIdentifierSubmit` function (lines 65–88) with:

```ts
/* ── Step 1: detect identifier type and check if account exists ── */
const handleIdentifierSubmit = async (e: FormEvent) => {
  e.preventDefault();
  setError("");
  const val = identifier.trim();
  if (!val) { setError("Please enter your email address or mobile number."); return; }

  // Detect type: email takes priority, then 10-digit phone
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
      setStep(exists ? "existing-user" : "new-user");
    } catch {
      setStep("existing-user");
    } finally {
      setLoading(false);
    }
  } else {
    // Phone path
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
        // New user — phone pre-filled, email left blank for them to fill
        setEmail("");
        setStep("new-user");
      }
    } catch {
      // Fallback: let them try signing in
      setStep("existing-user");
    } finally {
      setLoading(false);
    }
  }
};
```

- [ ] **Step 3: Update the identifier input in the JSX (Step 1 UI)**

In the JSX, find the `{step === "identifier" && (` block. Make three small changes:

1. Change the `<h1>` subtitle paragraph from:
```tsx
<p className="font-body text-[14px] text-stone mb-8">
  Enter your email address to get started.
</p>
```
to:
```tsx
<p className="font-body text-[14px] text-stone mb-8">
  Enter your email address or mobile number to get started.
</p>
```

2. Change the label from `"Email address"` to `"Email or mobile number"`:
```tsx
<label htmlFor="identifier" className="block font-body text-[13px] font-medium text-ink mb-1.5">
  Email or mobile number
</label>
```

3. Change the input from `type="email"` to `type="text"` and add a placeholder:
```tsx
<input
  id="identifier"
  type="text"
  inputMode="email"
  value={identifier}
  onChange={(e) => setIdentifier(e.target.value)}
  placeholder="Email address or 10-digit mobile number"
  className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm focus:outline-none focus:border-sage focus:ring-1 focus:ring-sage transition-all"
  autoFocus
  required
/>
```

Note: `inputMode="email"` keeps a sensible mobile keyboard while allowing digits too.

- [ ] **Step 4: Update the existing-user (sign-in) step to show the typed identifier**

In the `{step === "existing-user" && (` block, find the line that displays the email:

```tsx
<span className="font-body text-[14px] text-ink">{email}</span>
```

Replace it with the identifier the user typed (which may be a phone number):

```tsx
<span className="font-body text-[14px] text-ink">{identifier}</span>
```

The `email` state still holds the correct email for Supabase auth — this is purely a display change.

- [ ] **Step 5: Update the sign-up form to pre-fill correctly based on identifier type**

In the `{step === "new-user" && (` block, find the email input field (`id="signup-email"`). It currently has `value={email}`. That stays — but we need to handle the phone pre-fill correctly.

Find the phone input field (`id="signup-phone"`). It currently has `value={phone}`. That already works correctly: when the user entered a phone as identifier, `setPhone(digits)` was called in Step 2, so this field will be pre-filled automatically.

The email field (`value={email}`) will be empty when user entered phone as identifier (since `setEmail("")` was called). The user must fill it in. No change needed here — the existing required validation handles it.

Verify these two fields look like this (no change needed, just confirm they're correct):
```tsx
<input
  id="signup-phone"
  type="tel"
  value={phone}
  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
  placeholder="10-digit mobile number"
  ...
/>
```
```tsx
<input
  id="signup-email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  ...
/>
```

- [ ] **Step 6: Manual smoke test**

Start the dev server:
```bash
cd website && npm run dev
```

Test these scenarios:

| Scenario | Expected |
|---|---|
| Enter a valid email that exists | Routes to sign-in step, shows that email, signs in normally |
| Enter a valid email that doesn't exist | Routes to sign-up step with email pre-filled |
| Enter a 10-digit phone that exists | Routes to sign-in step, shows the phone number typed, signs in using resolved email |
| Enter a 10-digit phone that doesn't exist | Routes to sign-up step with phone pre-filled, email blank |
| Enter gibberish like "hello" | Shows validation error: "Please enter a valid email address or 10-digit mobile number." |
| Enter 9-digit number | Shows same validation error |

- [ ] **Step 7: Commit**

```bash
git add website/app/signin/page.tsx
git commit -m "feat: accept phone or email as sign-in/sign-up identifier"
```
