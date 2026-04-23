#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createSanityClient } from "@sanity/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEBSITE_ROOT = path.resolve(__dirname, "..");

function loadDotEnvLocal() {
  const envPath = path.join(WEBSITE_ROOT, ".env.local");
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function canonicalizeBowlSlug(raw, bowlIdToSlug, knownSlugs) {
  if (!raw) return null;
  if (knownSlugs.has(raw)) return raw;
  if (bowlIdToSlug.has(raw)) return bowlIdToSlug.get(raw);
  if (raw.startsWith("bowl-")) {
    const maybeSlug = raw.slice(5);
    if (knownSlugs.has(maybeSlug)) return maybeSlug;
  }
  return null;
}

async function fetchAllSubscriptionDayConfigs(supabase) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("subscription_day_configs")
      .select("id, bowl_slug")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function run() {
  loadDotEnvLocal();
  const isApplyMode = process.argv.includes("--apply");

  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const sanityProjectId = requiredEnv("NEXT_PUBLIC_SANITY_PROJECT_ID");
  const sanityDataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";

  const supabase = createSupabaseClient(supabaseUrl, supabaseServiceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sanity = createSanityClient({
    projectId: sanityProjectId,
    dataset: sanityDataset,
    apiVersion: "2024-01-01",
    useCdn: false,
  });

  const sanityBowls = await sanity.fetch(`*[_type == "bowl"]{ _id, "slug": slug.current, name }`);
  const bowlIdToSlug = new Map();
  const knownSlugs = new Set();
  for (const bowl of sanityBowls ?? []) {
    if (!bowl?._id || !bowl?.slug) continue;
    bowlIdToSlug.set(bowl._id, bowl.slug);
    knownSlugs.add(bowl.slug);
  }

  const configs = await fetchAllSubscriptionDayConfigs(supabase);
  const updates = [];
  const unknown = [];

  for (const row of configs) {
    const current = row.bowl_slug;
    const canonical = canonicalizeBowlSlug(current, bowlIdToSlug, knownSlugs);
    if (!canonical) {
      unknown.push({ id: row.id, bowl_slug: current });
      continue;
    }
    if (canonical !== current) {
      updates.push({ id: row.id, from: current, to: canonical });
    }
  }

  console.log(`Scanned rows: ${configs.length}`);
  console.log(`Needs normalization: ${updates.length}`);
  console.log(`Unresolved rows: ${unknown.length}`);

  if (updates.length > 0) {
    console.log("\nProposed updates (up to 25 shown):");
    for (const item of updates.slice(0, 25)) {
      console.log(`- ${item.id}: ${item.from} -> ${item.to}`);
    }
  }

  if (unknown.length > 0) {
    console.log("\nUnresolved rows (up to 25 shown):");
    for (const item of unknown.slice(0, 25)) {
      console.log(`- ${item.id}: ${item.bowl_slug}`);
    }
    console.log("\nThese rows need manual mapping or missing bowl docs restored in Sanity.");
  }

  if (!isApplyMode) {
    console.log("\nDry run complete. Re-run with --apply to persist changes.");
    return;
  }

  let successCount = 0;
  for (const item of updates) {
    const { error } = await supabase
      .from("subscription_day_configs")
      .update({ bowl_slug: item.to })
      .eq("id", item.id);
    if (error) {
      console.error(`Failed to update ${item.id}: ${error.message}`);
      continue;
    }
    successCount += 1;
  }

  console.log(`\nApplied updates: ${successCount}/${updates.length}`);
  if (unknown.length > 0) {
    console.log(`Unresolved rows remaining: ${unknown.length}`);
  }
}

run().catch((err) => {
  console.error("Normalization script failed:", err);
  process.exitCode = 1;
});
