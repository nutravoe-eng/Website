#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadDotEnvLocal();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const userPhone = "9980973722";
  const subscriptionId = "213063ad-eb77-4643-9485-aa742fe7d4cf";
  const bowlSlug = "tropical-mango-yoghurt-bowl";
  const slot = "7:00 AM - 8:00 AM";

  const customizations = [
    { ingredientId: "__preset_oats_roasted", option: "default" },
    { ingredientId: "honey", option: "extra" },
  ];

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, phone")
    .eq("phone", userPhone)
    .single();
  if (userError) throw userError;

  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("id, user_id, style")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();
  if (subError) throw subError;

  // Convert to spread because this configuration is day-based.
  const { error: subUpdateError } = await supabase
    .from("subscriptions")
    .update({
      style: "spread",
      delivery_time_slot: slot,
    })
    .eq("id", subscriptionId);
  if (subUpdateError) throw subUpdateError;

  const { error: deleteError } = await supabase
    .from("subscription_day_configs")
    .delete()
    .eq("subscription_id", subscriptionId);
  if (deleteError) throw deleteError;

  const rows = ["mon", "wed", "fri"].map((day) => ({
    subscription_id: subscriptionId,
    day_of_week: day,
    bowl_slug: bowlSlug,
    quantity: 1,
    delivery_time_slot: slot,
    customizations,
    customization_cost_rs: 0,
  }));

  const { error: insertError } = await supabase
    .from("subscription_day_configs")
    .insert(rows);
  if (insertError) throw insertError;

  console.log("Applied configuration successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

