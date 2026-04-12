# Phone + Email Auth — Design Spec
**Date:** 2026-04-12
**Status:** Approved

## Summary

Allow users to sign in and sign up using either their email address or their 10-digit mobile number as the identifier. Supabase auth remains email+password under the hood; phone is used as a lookup key to resolve the associated email.

---

## Architecture

### Identifier Detection (client-side)

The identifier input accepts free text. Detection logic:

- If the value contains `@` → treat as email (checked first to avoid misclassifying emails that contain 10 digits)
- Else strip all non-digit characters; if the result is exactly 10 digits → treat as phone
- Otherwise → show validation error: "Please enter a valid email address or 10-digit mobile number."

### Phone Sign-In Flow

1. User enters 10-digit phone number
2. Client calls `POST /api/auth/check-phone` with `{ phone }`
3. API returns `{ exists: true, email: "user@example.com" }` or `{ exists: false }`
4. If `exists: true` → store resolved email in state, advance to `"existing-user"` step
5. If `exists: false` → advance to `"new-user"` step with phone pre-filled
6. Sign-in itself calls `supabase.auth.signInWithPassword({ email, password })` — unchanged

### Email Flow

Unchanged from today.

---

## API Changes

### `POST /api/auth/check-phone`

**Request:** `{ phone: string }` — unchanged

**Response before:** `{ exists: boolean }`

**Response after:**
```json
{ "exists": true, "email": "user@example.com" }
{ "exists": false }
```

- Email is fetched from the `users` table alongside the `id` lookup
- Rate limit unchanged: 5 requests / 60 seconds per IP
- Security trade-off: a caller who knows a phone number can learn the associated email. Acceptable at this scale given the rate limit.

---

## UI Changes (`website/app/signin/page.tsx`)

### New state
```ts
const [identifierType, setIdentifierType] = useState<"email" | "phone">("email");
```

### Step 1 — Identifier input
- Label: `"Email or mobile number"`
- Input: `type="text"` (was `type="email"`)
- Placeholder: `"Email address or 10-digit mobile number"`
- Validation: detect phone vs email as described above
- On phone path: call `check-phone`, store resolved email in `email` state if found

### Step 2 — Existing user (sign-in)
- Display the identifier the user typed (phone or email), not necessarily the resolved email
- "Change" button resets to identifier step as before
- Auth call unchanged: `supabase.auth.signInWithPassword({ email, password })`

### Step 3 — New user (sign-up)
- If `identifierType === "phone"`: phone field pre-filled from identifier; email field empty (required)
- If `identifierType === "email"`: email field pre-filled from identifier (same as today)
- No structural changes to the form

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Input is neither email nor phone | Show inline error at identifier step |
| Phone not found → sign-up path | Normal sign-up flow, phone pre-filled |
| check-phone API error | Fall back to `"existing-user"` step (same as current email fallback) |
| Resolved email signs in but password wrong | Existing error message unchanged |

---

## Out of Scope

- Phone OTP / SMS authentication
- Making email optional during sign-up
- Any changes to the admin login flow
- Any changes to the reset-password flow
