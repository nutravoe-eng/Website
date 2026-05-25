import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const apiKey = envText
  .split("\n")
  .find((l) => l.startsWith("NEXT_PUBLIC_OLA_MAPS_API_KEY="))
  ?.split("=")
  .slice(1)
  .join("=")
  .trim()
  .replace(/^"|"$/g, "");

const ORIGIN = process.argv[2] || "http://localhost:3001";
const STYLE =
  "https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json?key=0.4.0&api_key=" +
  encodeURIComponent(apiKey);

const styleRes = await fetch(STYLE, { headers: { Origin: ORIGIN } });
const style = await styleRes.json();
console.log("origin", ORIGIN, "style", styleRes.status, style.message || `${style.layers?.length} layers`);

if (!style.layers) process.exit(0);

for (const [sourceId, spec] of Object.entries(style.sources || {})) {
  console.log("\nsource", sourceId, spec.type);
  if (!spec.url) continue;
  let tilejsonUrl = spec.url;
  if (!tilejsonUrl.includes("api_key")) {
    tilejsonUrl += (tilejsonUrl.includes("?") ? "&" : "?") + "api_key=" + encodeURIComponent(apiKey);
  }
  const tjRes = await fetch(tilejsonUrl, { headers: { Origin: ORIGIN } });
  const tjText = await tjRes.text();
  let tj;
  try {
    tj = JSON.parse(tjText);
  } catch {
    console.log("  tilejson parse fail", tjRes.status, tjText.slice(0, 150));
    continue;
  }
  console.log("  tilejson", tjRes.status, tj.message || `tiles=${tj.tiles?.length}`);
  if (!tj.tiles?.[0]) continue;
  const tileUrl = tj.tiles[0]
    .replace("{z}", "16")
    .replace("{x}", "46793")
    .replace("{y}", "30355");
  const full = tileUrl.includes("api_key")
    ? tileUrl
    : tileUrl + (tileUrl.includes("?") ? "&" : "?") + "api_key=" + encodeURIComponent(apiKey);
  const tileRes = await fetch(full, { headers: { Origin: ORIGIN } });
  const buf = await tileRes.arrayBuffer();
  const head = [...new Uint8Array(buf.slice(0, 12))];
  console.log("  tile", tileRes.status, buf.byteLength, "bytes", tileRes.headers.get("content-type"));
  console.log("  head", head.map((b) => b.toString(16).padStart(2, "0")).join(" "));
  if (tileRes.status !== 200) {
    console.log("  body", new TextDecoder().decode(buf.slice(0, 200)));
  }
  // MVT protobuf often starts with 0x1f 0x8b (gzip) or varint tags
}
