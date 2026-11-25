import type { Metadata } from "next";
import Link from "next/link";
import { adminSupabase } from "@/lib/supabase/admin";
import { isScratchCode } from "@/lib/scratch-cards";
import ScratchCard from "./ScratchCard";
import styles from "./scratch.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You’ve got a Nutravoe scratch card!",
  description: "Scratch it to see your cashback.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "You’ve got a Nutravoe scratch card!",
    description: "Scratch it to see your cashback.",
    siteName: "Nutravoe",
    type: "website",
    images: [{ url: "/scratch-assets/og.jpg", width: 1200, height: 630, alt: "Nutravoe scratch card" }],
  },
  twitter: { card: "summary_large_image", images: ["/scratch-assets/og.jpg"] },
};

export default async function ScratchPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const card = isScratchCode(code)
    ? (await adminSupabase.from("scratch_cards").select("amount_rs, scratched_at, paid_at, customer_name").eq("code", code).maybeSingle()).data
    : null;

  return (
    <main id="main" className={styles.page}>
      {card ? (
        <div className={styles.wrap}>
          <h1 className={styles.title}>
            {card.customer_name ? `Thank you, ${card.customer_name.split(" ")[0]}!` : "A little thank-you from Nutravoe"}
          </h1>
          <p className={styles.lead}>
            {card.scratched_at ? "Here’s your scratch card." : "Thanks for rating us on Zomato. Scratch the card to see your cashback."}
          </p>
          <ScratchCard code={code} amount={card.amount_rs} alreadyScratched={!!card.scratched_at} paid={!!card.paid_at} />
        </div>
      ) : (
        <div className={styles.wrap}>
          <h1 className={styles.title}>This card link doesn’t work</h1>
          <p className={styles.lead}>Please check the link we sent you on WhatsApp, or message us there and we’ll help.</p>
          <Link className={styles.order} href="/menu">See the Nutravoe menu</Link>
        </div>
      )}
    </main>
  );
}
