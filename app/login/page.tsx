import PhoneOtpLogin from "@/components/PhoneOtpLogin";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const redirectTo =
    typeof searchParams?.next === "string" && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/account";

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5 py-24">
      <PhoneOtpLogin redirectTo={redirectTo} />
    </div>
  );
}
