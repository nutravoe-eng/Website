import PhoneOtpLogin from "@/components/PhoneOtpLogin";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5 py-24">
      <PhoneOtpLogin redirectTo="/account" />
    </div>
  );
}
