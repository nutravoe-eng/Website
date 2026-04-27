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

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error("Usage: node scripts/check-subscriptions-by-email.mjs <email>");
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
    .eq("email", email)
    .order("created_at", { ascending: true });

  if (usersError) throw usersError;

  console.log(`users_count=${users?.length ?? 0}`);

  for (const user of users ?? []) {
    console.log(`user=${JSON.stringify(user)}`);
    const { data: authUserResult, error: authUserError } = await supabase.auth.admin.getUserById(user.id);
    if (authUserError) {
      console.log(`auth_lookup_error_for_${user.id}=${authUserError.message}`);
    } else {
      console.log(`auth_user_for_${user.id}=${authUserResult?.user ? "exists" : "missing"}`);
    }
    const { data: subs, error: subsError } = await supabase
      .from("subscriptions")
      .select("id, status, payment_status, created_at, start_date")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (subsError) throw subsError;
    console.log(`subscriptions_count_for_${user.id}=${subs?.length ?? 0}`);
    for (const sub of subs ?? []) {
      console.log(`subscription=${JSON.stringify(sub)}`);
    }

    const { data: uiRows, error: uiError } = await supabase
      .from("subscriptions")
      .select("*, subscription_plans ( slug )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    console.log(`ui_query_error_for_${user.id}=${uiError ? uiError.message : "none"}`);
    console.log(`ui_query_rows_for_${user.id}=${uiRows?.length ?? 0}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

