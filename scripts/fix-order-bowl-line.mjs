#!/usr/bin/env node
/**
 * One-off: update a subscription order line item bowl (e.g. after a manual swap).
 *
 * Usage:
 *   node scripts/fix-order-bowl-line.mjs --phone=9876543210 --date=2026-04-27 --from-slug=dragon-glow --to-slug=very-fruity --apply
 *   node scripts/fix-order-bowl-line.mjs --name=Ronak --date=2026-04-27 --from-slug=dragon-glow --to-slug=very-fruity --apply
 *
 * Omit --apply for dry-run (prints what would change).
 */

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

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (p) return p.split("=")[1]?.trim() ?? "";
  return "";
}

function todayISTYmd() {
  const s = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const d = new Date(s);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normPhone(x) {
  return String(x ?? "")
    .replace(/\D/g, "")
    .slice(-10);
}

loadDotEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (from .env.local)");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const apply = process.argv.includes("--apply");
const listOnly = process.argv.includes("--list");
const phone = arg("phone");
const name = arg("name");
const date = arg("date") || todayISTYmd();
const fromSlug = arg("from-slug");
const toSlug = arg("to-slug");
const toName = arg("to-name") || "";

if (!listOnly && (!fromSlug || !toSlug)) {
  console.error("Required: --from-slug=... --to-slug=... (e.g. dragon-glow, very-fruity)  OR  use --list with --name/--phone");
  process.exit(1);
}

if (!phone && !name) {
  console.error("Provide --phone=... (10 digits) or --name=... (partial name match)");
  process.exit(1);
}

let userIds = [];
if (phone) {
  const p = normPhone(phone);
  const { data: found, error } = await supabase
    .from("users")
    .select("id, full_name, phone")
    .or(`phone.ilike.%${p}%,phone.ilike.%+91${p}%,phone.ilike.%${p.slice(-10)}%`);
  if (error) throw error;
  if (!found?.length) {
    console.error("No user found for phone-like:", p);
    process.exit(1);
  }
  if (found.length > 1) {
    console.log("Multiple users; use a more specific --phone=:");
    found.forEach((u) => console.log(" ", u.id, u.full_name, u.phone));
    process.exit(1);
  }
  userIds = [found[0].id];
  console.log("User:", found[0]);
} else {
  const { data: users, error } = await supabase
    .from("users")
    .select("id, full_name, phone")
    .ilike("full_name", `%${name}%`);
  if (error) throw error;
  if (!users?.length) {
    console.error("No users match name:", name);
    process.exit(1);
  }
  if (users.length > 1) {
    console.log("Multiple matches; use --phone= to disambiguate:");
    users.forEach((u) => console.log(" ", u.id, u.full_name, u.phone));
    process.exit(1);
  }
  userIds = [users[0].id];
  console.log("User:", users[0]);
}

const userId = userIds[0];

const { data: orders, error: oErr } = await supabase
  .from("orders")
  .select("id, delivery_date, status, order_type, subscription_id, user_id, order_items ( id, bowl_slug, bowl_name, quantity )")
  .eq("user_id", userId)
  .eq("delivery_date", date);

if (oErr) throw oErr;
if (!orders?.length) {
  console.error("No orders on", date, "for this user. Try another --date=YYYY-MM-DD");
  process.exit(1);
}

if (listOnly) {
  console.log(JSON.stringify(orders, null, 2));
  process.exit(0);
}

const matches = [];
for (const o of orders) {
  const items = Array.isArray(o.order_items) ? o.order_items : [];
  for (const it of items) {
    if (String(it.bowl_slug ?? "").toLowerCase() === fromSlug.toLowerCase()) {
      matches.push({ order: o, item: it });
    }
  }
}

if (matches.length === 0) {
  console.log("Orders on that date:", JSON.stringify(orders, null, 2));
  console.error("No line item with bowl_slug matching:", fromSlug);
  process.exit(1);
}

if (matches.length > 1) {
  console.error("Multiple matching line items; narrow down manually in SQL.");
  console.log(JSON.stringify(matches, null, 2));
  process.exit(1);
}

const { order, item } = matches[0];
const newName = toName || toSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
console.log("\nPlanned change:");
console.log("  order_id:", order.id);
console.log("  order_item_id:", item.id);
console.log("  from:", item.bowl_slug, item.bowl_name);
console.log("  to:  ", toSlug, newName);
console.log("  dry-run:", !apply);

if (!apply) {
  console.log("\nRe-run with --apply to write.");
  process.exit(0);
}

const { error: uErr } = await supabase
  .from("order_items")
  .update({ bowl_slug: toSlug, bowl_name: newName })
  .eq("id", item.id)
  .eq("order_id", order.id);

if (uErr) {
  console.error("Update failed:", uErr.message);
  process.exit(1);
}
console.log("OK — order line updated.");
process.exit(0);
