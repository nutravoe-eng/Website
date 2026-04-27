"use client";

import { useEffect, useState } from "react";
import { getAllBowls } from "@/lib/sanity";
import type { Bowl } from "@/types";
import SubscriptionsClient from "./SubscriptionsClient";

export default function SubscriptionsPage() {
  const [bowls, setBowls] = useState<Bowl[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const list = await getAllBowls();
        setBowls(Array.isArray(list) ? list : []);
      } catch {
        setErr("Could not load subscription details.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-sage border-t-transparent animate-spin" />
      </div>
    );
  }

  if (err) {
    return <p className="font-body text-sm text-terracotta">{err}</p>;
  }

  return <SubscriptionsClient bowls={bowls} />;
}
