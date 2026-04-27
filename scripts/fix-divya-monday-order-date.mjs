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

  const subscriptionId = "213063ad-eb77-4643-9485-aa742fe7d4cf";
  const wrongDate = "2026-05-04";
  const correctDate = "2026-04-27";

  const { data: wrongOrders, error: wrongOrderErr } = await supabase
    .from("orders")
    .select("id, delivery_date, status")
    .eq("subscription_id", subscriptionId)
    .eq("delivery_date", wrongDate);
  if (wrongOrderErr) throw wrongOrderErr;

  for (const ord of wrongOrders ?? []) {
    const { error: delErr } = await supabase
      .from("orders")
      .delete()
      .eq("id", ord.id);
    if (delErr) throw delErr;
    console.log(`Deleted wrong order ${ord.id} (${ord.delivery_date}).`);
  }

  const { data: existingCorrect, error: existingCorrectErr } = await supabase
    .from("orders")
    .select("id, delivery_date, status")
    .eq("subscription_id", subscriptionId)
    .eq("delivery_date", correctDate);
  if (existingCorrectErr) throw existingCorrectErr;

  if ((existingCorrect ?? []).length > 0) {
    const ids = existingCorrect.map((o) => o.id);
    const { error: markDeliveredErr } = await supabase
      .from("orders")
      .update({ status: "delivered" })
      .in("id", ids);
    if (markDeliveredErr) throw markDeliveredErr;
    console.log(`Marked existing ${ids.length} order(s) on ${correctDate} as delivered.`);
  } else {
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select(`
        id,
        delivery_time_slot,
        subscription_plans:plan_id (price_per_bowl),
        subscription_day_configs (day_of_week, bowl_slug, quantity, customization_cost_rs, customizations, delivery_time_slot)
      `)
      .eq("id", subscriptionId)
      .single();
    if (subErr) throw subErr;

    const mondayConfigs = (sub.subscription_day_configs ?? []).filter((c) => c.day_of_week === "mon");
    if (mondayConfigs.length === 0) {
      throw new Error("No Monday day config found for subscription.");
    }

    const unitPrice = sub.subscription_plans?.price_per_bowl ?? 0;
    const bowls = mondayConfigs.map((cfg) => ({
      bowl_slug: cfg.bowl_slug,
      bowl_name: cfg.bowl_slug,
      quantity: cfg.quantity,
      unit_price: unitPrice,
      customization_unit_price: cfg.customization_cost_rs ?? 0,
      customizations: cfg.customizations ?? [],
    }));
    const slot = mondayConfigs[0].delivery_time_slot ?? sub.delivery_time_slot ?? "7:00 AM - 8:00 AM";

    const { error: rpcErr } = await supabase.rpc("create_subscription_delivery", {
      p_subscription_id: subscriptionId,
      p_delivery_date: correctDate,
      p_delivery_time_slot: slot,
      p_bowls: bowls,
      p_status: "delivered",
    });
    if (rpcErr) throw rpcErr;
    console.log(`Created delivered order for ${correctDate}.`);
  }

  const { data: finalRows, error: finalErr } = await supabase
    .from("orders")
    .select("id, delivery_date, status")
    .eq("subscription_id", subscriptionId)
    .in("delivery_date", [correctDate, wrongDate])
    .order("delivery_date", { ascending: true });
  if (finalErr) throw finalErr;

  console.log("Final rows:");
  console.log(JSON.stringify(finalRows ?? [], null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

