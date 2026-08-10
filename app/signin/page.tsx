import { redirect } from "next/navigation";

/**
 * Email/password sign-in has been retired — Nutravoe now signs users in
 * with a phone number + OTP only. This page is kept only so every existing
 * `/signin?next=...` link across the site (cart, invoice, subscribe wizard,
 * dashboard layout, navbar) keeps working without needing to be edited —
 * it forwards straight to the new phone login flow, preserving `next`.
 */
export default function SignInRedirect({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next =
    typeof searchParams?.next === "string" && searchParams.next.startsWith("/")
      ? `?next=${encodeURIComponent(searchParams.next)}`
      : "";

  redirect(`/login${next}`);
}
