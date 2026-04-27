#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function normalizePhone(raw) {
  return String(raw ?? "").replace(/\D/g, "").slice(-10);
}

function summarizeCustomizations(customizations) {
  if (!Array.isArray(customizations) || customizations.length === 0) {
    return {
      base: "yogurt",
      oats: "soaked",
      sugar: "regular",
      added: [],
      removed: [],
    };
  }

  const flattened = Array.isArray(customizations[0])
    ? customizations.flatMap((entry) => (Array.isArray(entry) ? entry : []))
    : customizations;

  const added = [];
  const removed = [];
  let base = "yogurt";
  let oats = "soaked";
  let sugar = "regular";

  for (const item of flattened) {
    if (!item || typeof item !== "object") continue;
    const ingredientId = String(item.ingredientId ?? "");
    const option = String(item.option ?? "default");

    if (ingredientId === "__preset_base_milk") {
      base = "milk";
      continue;
    }
    if (ingredientId === "__preset_oats_roasted") {
      oats = "roasted";
      continue;
    }
    if (ingredientId === "__preset_no_sugar") {
      sugar = "no_sugar";
      continue;
    }
    if (!ingredientId || ingredientId.startsWith("__preset_")) continue;
    if (option === "extra") added.push(ingredientId);
    if (option === "remove") removed.push(ingredientId);
  }

  return { base, oats, sugar, added, removed };
}

async function main() {
  const rawPhone = process.argv[2];
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 10) {
    throw new Error("Usage: node scripts/find-subscription-config-by-phone.mjs <10-digit-phone>");
  }

  loadDotEnvLocal();
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, full_name, email, phone, created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: true });

  if (usersError) throw usersError;
  if (!users || users.length === 0) {
    console.log(`No user found for phone ${phone}`);
    return;
  }

  for (const user of users) {
    console.log("\n==================================================");
    console.log(`User: ${user.full_name ?? "(no name)"}`);
    console.log(`Email: ${user.email ?? "(no email)"}`);
    console.log(`Phone: ${user.phone ?? "(no phone)"}`);
    console.log(`User ID: ${user.id}`);

    const { data: subs, error: subsError } = await supabase
      .from("subscriptions")
      .select(`
        id,
        user_id,
        style,
        status,
        payment_status,
        billing_cycle,
        start_date,
        period_end_date,
        delivery_time_slot,
        total_amount_rs,
        delivery_fee,
        created_at,
        subscription_plans ( id, slug, name ),
        subscription_day_configs (
          id,
          day_of_week,
          bowl_slug,
          quantity,
          delivery_time_slot,
          customizations,
          customization_cost_rs
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (subsError) throw subsError;

    if (!subs || subs.length === 0) {
      console.log("No subscriptions found.");
      continue;
    }

    for (const sub of subs) {
      console.log("\n---------------- Subscription ----------------");
      console.log(`Subscription ID: ${sub.id}`);
      console.log(`Plan: ${sub.subscription_plans?.name ?? sub.subscription_plans?.slug ?? "(unknown)"}`);
      console.log(`Style: ${sub.style}`);
      console.log(`Status: ${sub.status}`);
      console.log(`Payment: ${sub.payment_status}`);
      console.log(`Billing cycle: ${sub.billing_cycle ?? "(n/a)"}`);
      console.log(`Start date: ${sub.start_date ?? "(n/a)"}`);
      console.log(`End date: ${sub.period_end_date ?? "(n/a)"}`);
      console.log(`Global slot: ${sub.delivery_time_slot ?? "(none)"}`);
      console.log(`Amount: ${sub.total_amount_rs ?? 0} | Delivery fee: ${sub.delivery_fee ?? 0}`);
      console.log(`Created: ${sub.created_at}`);

      const dayRows = Array.isArray(sub.subscription_day_configs) ? sub.subscription_day_configs : [];
      if (dayRows.length === 0) {
        console.log("Day configs: (none)");
        continue;
      }

      console.log("Day configs:");
      for (const row of dayRows) {
        const c = summarizeCustomizations(row.customizations);
        console.log(
          `- ${row.day_of_week} | bowl=${row.bowl_slug} x${row.quantity} | slot=${row.delivery_time_slot ?? sub.delivery_time_slot ?? "(none)"}`,
        );
        console.log(
          `  base=${c.base}, oats=${c.oats}, sugar=${c.sugar}, added=[${c.added.join(", ")}], removed=[${c.removed.join(", ")}], extra_rs=${row.customization_cost_rs ?? 0}`,
        );
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

