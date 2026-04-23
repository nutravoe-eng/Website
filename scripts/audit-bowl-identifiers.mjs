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
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function isResolvable(value, slugSet, idToSlug) {
  if (!value) return false;
  if (slugSet.has(value)) return true;
  if (idToSlug.has(value)) return true;
  if (value.startsWith("bowl-") && slugSet.has(value.slice(5))) return true;
  return false;
}

async function main() {
  loadDotEnvLocal();

  const sanity = createSanityClient({
    projectId: requiredEnv("NEXT_PUBLIC_SANITY_PROJECT_ID"),
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
    apiVersion: "2024-01-01",
    useCdn: false,
  });

  const bowls = await sanity.fetch(
    `*[_type == "bowl"]{
      _id,
      name,
      "slug": slug.current,
      available,
      inStock
    } | order(name asc)`,
  );

  console.log("Current bowls in Sanity:");
  for (const bowl of bowls) {
    console.log(
      `- ${bowl.name} | slug=${bowl.slug} | id=${bowl._id} | available=${bowl.available} | inStock=${bowl.inStock}`,
    );
  }

  const idToSlug = new Map(
    bowls.filter((b) => b?._id && b?.slug).map((b) => [b._id, b.slug]),
  );
  const slugSet = new Set(bowls.map((b) => b.slug).filter(Boolean));

  const supabase = createSupabaseClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: rows, error } = await supabase
    .from("subscription_day_configs")
    .select("id, subscription_id, bowl_slug");

  if (error) throw error;

  const unresolved = (rows || []).filter(
    (r) => !isResolvable(r.bowl_slug, slugSet, idToSlug),
  );

  console.log(`\nsubscription_day_configs rows: ${(rows || []).length}`);
  console.log(`Resolvable with current bowls: ${(rows || []).length - unresolved.length}`);
  console.log(`Unresolvable: ${unresolved.length}`);
  if (unresolved.length) {
    console.log("Sample unresolvable rows:");
    for (const row of unresolved.slice(0, 20)) {
      console.log(`- id=${row.id} sub=${row.subscription_id} bowl_slug=${row.bowl_slug}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
