/**
 * Deep probe of Ola Maps style + sample vector tiles.
 * Usage: node scripts/probe-ola-maps.mjs
 * Reads NEXT_PUBLIC_OLA_MAPS_API_KEY from .env.local (no key printed).
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const envText = readFileSync(envPath, "utf8");
const keyLine = envText.split("\n").find((l) => l.startsWith("NEXT_PUBLIC_OLA_MAPS_API_KEY="));
const apiKey = keyLine?.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
if (!apiKey) {
  console.error("Missing NEXT_PUBLIC_OLA_MAPS_API_KEY in .env.local");
  process.exit(1);
}

const STYLE_BASE =
  "https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json?key=0.4.0";

const ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://nutravoe.in",
  "https://www.nutravoe.in",
  "https://website-eight-woad-o6pysa9axv.vercel.app",
];

function redactKey(url) {
  return url.replace(apiKey, "***");
}

async function fetchStyle(origin) {
  const url = `${STYLE_BASE}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { Origin: origin } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _parseError: true, preview: text.slice(0, 200) };
  }
  return { origin, status: res.status, json };
}

async function fetchTile(url, origin) {
  const res = await fetch(url, { headers: { Origin: origin } });
  const buf = await res.arrayBuffer();
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    bytes: buf.byteLength,
    firstBytes: [...new Uint8Array(buf.slice(0, 16))].map((b) => b.toString(16).padStart(2, "0")).join(" "),
  };
}

function findNullNumbers(obj, path = "") {
  const hits = [];
  if (obj === null) hits.push(path || "(root null)");
  else if (Array.isArray(obj)) {
    obj.forEach((v, i) => hits.push(...findNullNumbers(v, path + "[" + i + "]")));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (v === null && /zoom|offset|height|elevation|extrusion|pitch|terrain|radius|width|opacity/i.test(k)) {
        hits.push(p);
      }
      hits.push(...findNullNumbers(v, p));
    }
  }
  return hits;
}

// Mirror MapPicker sanitizeOlaStyle (minimal)
function sanitizeOlaStyle(style) {
  if (!style || typeof style !== "object") return style;
  const styleObj = structuredClone(style);
  delete styleObj.terrain;
  delete styleObj.fog;
  delete styleObj.sky;
  if (styleObj.sources) {
    styleObj.sources = Object.fromEntries(
      Object.entries(styleObj.sources).filter(([, s]) => String(s?.type || "").toLowerCase() !== "raster-dem"),
    );
  }
  const sourceIds = new Set(Object.keys(styleObj.sources ?? {}));
  if (Array.isArray(styleObj.layers)) {
    styleObj.layers = styleObj.layers.filter((layer) => {
      const id = String(layer.id || "").toLowerCase();
      const type = String(layer.type || "").toLowerCase();
      const source = typeof layer.source === "string" ? layer.source : null;
      const sl = String(layer["source-layer"] || "").toLowerCase();
      if (source && !sourceIds.has(source)) return false;
      if (id.includes("3d") || id.includes("terrain") || id.includes("hillshade")) return false;
      if (sl.includes("3d") || sl === "3d_model") return false;
      if (type === "fill-extrusion" || type === "hillshade" || type === "sky") return false;
      return true;
    });
  }
  return styleObj;
}

console.log("=== Ola Maps probe (key redacted) ===\n");

for (const origin of ORIGINS) {
  const { status, json } = await fetchStyle(origin);
  const ok = Array.isArray(json.layers) && json.layers.length > 0;
  console.log(`Origin: ${origin}`);
  console.log(`  style HTTP ${status} → ${ok ? `OK (${json.layers.length} layers)` : json.message || json._parseError || "invalid"}`);
  if (!ok) {
    console.log("");
    continue;
  }

  const nullHits = findNullNumbers(json).slice(0, 8);
  if (nullHits.length) console.log(`  suspicious nulls in raw style: ${nullHits.join(", ")}`);

  const vecSource = Object.entries(json.sources || {}).find(([, s]) => s.type === "vector");
  if (vecSource) {
    const [sourceId, spec] = vecSource;
    const tiles = spec.tiles || [];
    if (tiles[0]) {
      const tileUrl = tiles[0].replace("{z}", "16").replace("{x}", "46793").replace("{y}", "30355");
      const withKey = tileUrl.includes("api_key=") ? tileUrl : `${tileUrl}${tileUrl.includes("?") ? "&" : "?"}api_key=${apiKey}`;
      const tile = await fetchTile(withKey, origin);
      console.log(`  sample tile (${sourceId}): HTTP ${tile.status}, ${tile.bytes} bytes, type=${tile.contentType}`);
      console.log(`    url: ${redactKey(withKey.slice(0, 120))}...`);
      console.log(`    magic: ${tile.firstBytes}`);
      if (tile.status !== 200 || tile.bytes < 100) {
        console.log("  *** TILE FAILURE — likely cause of blank map ***");
      }
    }
  }

  const sanitized = sanitizeOlaStyle(json);
  const removed = (json.layers?.length || 0) - (sanitized.layers?.length || 0);
  console.log(`  sanitize: ${json.layers.length} → ${sanitized.layers.length} layers (removed ${removed})`);
  console.log("");
}

console.log("Done.");
