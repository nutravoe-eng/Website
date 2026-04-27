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

async function main() {
  loadDotEnvLocal();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: rows, error } = await supabase
    .from("orders")
    .select("id, subscription_id, notes")
    .eq("order_type", "subscription")
    .or("notes.is.null,notes.eq.")
    .not("subscription_id", "is", null);

  if (error) throw error;
  const targets = rows ?? [];
  console.log(`Found ${targets.length} subscription order(s) missing notes.`);

  if (targets.length === 0) return;

  const subIds = Array.from(new Set(targets.map((r) => r.subscription_id).filter(Boolean)));
  const { data: subs, error: subsErr } = await supabase
    .from("subscriptions")
    .select("id, notes")
    .in("id", subIds);
  if (subsErr) throw subsErr;

  const noteBySub = new Map(
    (subs ?? [])
      .filter((s) => typeof s.notes === "string" && s.notes.trim().length > 0)
      .map((s) => [s.id, `Customer: ${s.notes.trim()}`]),
  );

  let updated = 0;
  for (const row of targets) {
    const note = noteBySub.get(row.subscription_id);
    if (!note) continue;
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ notes: note })
      .eq("id", row.id);
    if (updateErr) throw updateErr;
    updated += 1;
  }

  console.log(`Updated ${updated} subscription order(s) with customer notes.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

