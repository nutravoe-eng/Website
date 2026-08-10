import PhoneOtpLogin from "@/components/PhoneOtpLogin";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const redirectTo =
    typeof searchParams?.next === "string" && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/account";
  const error =
    typeof searchParams?.error === "string" && searchParams.error.trim()
      ? searchParams.error
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5 py-24">
      <div className="w-full max-w-sm">
        {error ? (
          <p className="mb-4 rounded-xl border border-terracotta/25 bg-terracotta/5 px-3.5 py-2.5 font-body text-[12px] text-terracotta">
            {error}
          </p>
        ) : null}
        <PhoneOtpLogin redirectTo={redirectTo} />
      </div>
    </div>
  );
}
