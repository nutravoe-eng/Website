/**
 * Server-side Ola Maps (Krutrim) REST helpers.
 * Base URL and paths match the official Python client (api.olamaps.io).
 *
 * Auth: `api_key` query param — see https://maps.olakrutrim.com/docs/auth
 *
 * Env: `OLA_MAPS_API_KEY` or `OLAMAPS_API_KEY` (either works).
 *
 * Domain allowlist: Ola checks `Referer` / `Origin`. API routes pass
 * {@link requestOriginReferrer} so the port matches the running dev server (3000, 3001, …).
 * For code without a request (e.g. checkout pricing), set `OLA_MAPS_HTTP_REFERER` or
 * `NEXT_PUBLIC_SITE_URL` (canonical origin, usually allowlisted in Krutrim) or rely on
 * `PORT` in development and `VERCEL_URL` as a last resort.
 */

const OLA_BASE = "https://api.olamaps.io";

export function getOlaMapsApiKey(): string | undefined {
  return process.env.OLA_MAPS_API_KEY?.trim() || process.env.OLAMAPS_API_KEY?.trim();
}

function normalizeReferrerUrl(urlLike: string): string | null {
  try {
    const u = new URL(urlLike.includes("://") ? urlLike : `https://${urlLike}`);
    return u.href.endsWith("/") ? u.href : `${u.href}/`;
  } catch {
    return null;
  }
}

/**
 * Prefer this when handling a Next.js `Request`: the `Host` header includes the real port
 * (`localhost:3001`, `localhost:3002`, …) when `next dev` picks a free port.
 */
export function requestOriginReferrer(req: { headers: Headers }): string | undefined {
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host")?.trim();
  if (!host) return undefined;

  let proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto !== "http" && proto !== "https") {
    proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  }

  const normalized = normalizeReferrerUrl(`${proto}://${host}/`);
  return normalized ?? undefined;
}

/**
 * Canonical site URL for Ola when the per-request Referer (e.g. a one-off `*.vercel.app` host)
 * is not on the Krutrim allowlist. Set `NEXT_PUBLIC_SITE_URL` to your production origin.
 */
function alternateReferrerForOla(preferredReferrer?: string | null): string | undefined {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!site) return undefined;
  const siteNorm = normalizeReferrerUrl(site);
  if (!siteNorm) return undefined;
  if (preferredReferrer) {
    const p = normalizeReferrerUrl(preferredReferrer);
    if (p && p === siteNorm) return undefined;
  }
  return siteNorm;
}

/**
 * Base URL (with trailing slash) that must match an entry in the Ola API key domain allowlist.
 *
 * @param preferred — Usually from {@link requestOriginReferrer}; wins over env defaults.
 */
export function getOlaHttpReferrer(preferred?: string | null): string {
  if (preferred) {
    const n = normalizeReferrerUrl(preferred);
    if (n) return n;
  }

  const explicit = process.env.OLA_MAPS_HTTP_REFERER?.trim();
  if (explicit) {
    const n = normalizeReferrerUrl(explicit);
    if (n) return n;
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    const n = normalizeReferrerUrl(site);
    if (n) return n;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").split("/")[0];
    return `https://${host}/`;
  }

  if (process.env.NODE_ENV === "development") {
    const port = process.env.PORT?.trim() || "3000";
    return `http://localhost:${port}/`;
  }

  return "https://nutravoe.in/";
}

function olaReferrerHeaders(preferredReferrer?: string | null): Record<string, string> {
  const referer = getOlaHttpReferrer(preferredReferrer);
  try {
    const origin = new URL(referer).origin;
    return { Referer: referer, Origin: origin };
  } catch {
    return { Referer: "https://nutravoe.in/", Origin: "https://nutravoe.in" };
  }
}

function normalizeGeocodeAddress(address: string): string {
  return address.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

function coordFromUnknown(r: unknown): { lat: number; lng: number } | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;

  const geom = o.geometry;
  if (geom && typeof geom === "object") {
    const g = geom as Record<string, unknown>;
    const loc = g.location;
    if (loc && typeof loc === "object") {
      const l = loc as Record<string, unknown>;
      const lat = typeof l.lat === "number" ? l.lat : Number(l.lat);
      const lng = typeof l.lng === "number" ? l.lng : typeof l.lon === "number" ? l.lon : Number(l.lng ?? l.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }

  const lat = typeof o.lat === "number" ? o.lat : Number(o.lat);
  const lng =
    typeof o.lng === "number" ? o.lng : typeof o.lon === "number" ? o.lon : Number(o.lng ?? o.lon);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  return null;
}

function labelFromGeocodeResult(r: unknown): string | undefined {
  if (!r || typeof r !== "object") return undefined;
  const o = r as Record<string, unknown>;
  for (const k of ["formatted_address", "name", "description", "address"] as const) {
    const v = o[k];
    if (typeof v === "string" && v.length) return v;
  }
  return undefined;
}

async function olaGetJsonOnce(
  path: string,
  params: Record<string, string>,
  preferredReferrer?: string | null,
): Promise<unknown | null> {
  const key = getOlaMapsApiKey();
  if (!key) return null;

  const u = new URL(`${OLA_BASE}${path}`);
  u.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  try {
    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json", ...olaReferrerHeaders(preferredReferrer) },
      next: { revalidate: 86_400 },
    });
    const data = (await res.json()) as Record<string, unknown>;
    const code = typeof data.status_code === "number" ? data.status_code : res.status;
    if (!res.ok || code >= 400) return null;
    return data;
  } catch {
    return null;
  }
}

async function olaGetJson(
  path: string,
  params: Record<string, string>,
  preferredReferrer?: string | null,
): Promise<unknown | null> {
  const first = await olaGetJsonOnce(path, params, preferredReferrer);
  if (first !== null) return first;
  const alt = alternateReferrerForOla(preferredReferrer);
  if (alt) return await olaGetJsonOnce(path, params, alt);
  return null;
}

/**
 * Forward geocode — returns raw `geocodingResults` entries (best-effort parse).
 */
export async function olaGeocodeResults(address: string, preferredReferrer?: string | null): Promise<unknown[]> {
  const normalized = normalizeGeocodeAddress(address);
  if (!normalized.length) return [];

  const data = await olaGetJson("/places/v1/geocode", { address: normalized }, preferredReferrer);
  if (!data || typeof data !== "object") return [];

  const raw = (data as Record<string, unknown>).geocodingResults;
  if (Array.isArray(raw)) return raw;

  const alt = (data as Record<string, unknown>).geocoding_results;
  if (Array.isArray(alt)) return alt;

  return [];
}

export interface GeocodeHit {
  lat: number;
  lng: number;
  display_name: string;
}

export function geocodeHitsFromResults(results: unknown[], limit: number): GeocodeHit[] {
  const out: GeocodeHit[] = [];
  for (const r of results) {
    const c = coordFromUnknown(r);
    if (!c) continue;
    const display_name = labelFromGeocodeResult(r) ?? `${c.lat}, ${c.lng}`;
    out.push({ ...c, display_name });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Driving distance (km) via POST /routing/v1/directions — road distance for pricing.
 */
export async function olaDrivingDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  preferredReferrer?: string | null,
): Promise<number | null> {
  const key = getOlaMapsApiKey();
  if (!key) return null;

  const u = new URL(`${OLA_BASE}/routing/v1/directions`);
  u.searchParams.set("api_key", key);
  u.searchParams.set("origin", `${originLat},${originLng}`);
  u.searchParams.set("destination", `${destLat},${destLng}`);
  u.searchParams.set("overview", "false");

  async function attemptDirections(referrer: string | null | undefined): Promise<number | null> {
    try {
      const res = await fetch(u.toString(), {
        method: "POST",
        headers: { Accept: "application/json", ...olaReferrerHeaders(referrer) },
        cache: "no-store",
      });
      const raw = (await res.json()) as Record<string, unknown>;
      const code = typeof raw.status_code === "number" ? raw.status_code : res.status;
      if (!res.ok || code >= 400) {
        if (process.env.NODE_ENV === "development") {
          const msg =
            typeof raw.message === "string"
              ? raw.message
              : typeof raw.reason === "string"
                ? raw.reason
                : undefined;
          console.error("[ola-maps] directions HTTP error", {
            http: res.status,
            message: msg,
            bodyKeys: Object.keys(raw),
          });
        }
        return null;
      }

      const meters = distanceMetersFromDirectionsPayload(raw);
      if (meters === null || !Number.isFinite(meters) || meters < 0) {
        if (process.env.NODE_ENV === "development") {
          const r0 = Array.isArray(raw.routes) ? raw.routes[0] : undefined;
          console.error("[ola-maps] directions: could not parse road distance (meters)", {
            topKeys: Object.keys(raw),
            route0Keys: r0 && typeof r0 === "object" ? Object.keys(r0 as object) : null,
          });
        }
        return null;
      }
      return meters / 1000;
    } catch {
      return null;
    }
  }

  // Do not cache: pricing must reflect live routing; stale cache also hid parsing/API issues.
  const first = await attemptDirections(preferredReferrer);
  if (first !== null) return first;
  const alt = alternateReferrerForOla(preferredReferrer);
  if (alt) return await attemptDirections(alt);
  return null;
}

/** Normalize distance-like fields (meters) from Ola / OSRM-style route objects. */
function readDistanceMetersField(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  if (v && typeof v === "object" && "value" in (v as object)) {
    return readDistanceMetersField((v as Record<string, unknown>).value);
  }
  return null;
}

function distanceMetersFromDirectionsPayload(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  let routes = d.routes;
  if ((!Array.isArray(routes) || routes.length === 0) && d.data && typeof d.data === "object") {
    const inner = (d.data as Record<string, unknown>).routes;
    if (Array.isArray(inner) && inner.length > 0) routes = inner;
  }
  if (!Array.isArray(routes) || routes.length === 0) return null;

  const route = routes[0];
  if (!route || typeof route !== "object") return null;
  const r = route as Record<string, unknown>;

  const direct = readDistanceMetersField(r.distance);
  if (direct !== null) return direct;

  const summary = r.summary;
  if (summary && typeof summary === "object") {
    const s = summary as Record<string, unknown>;
    for (const key of ["distance", "totalDistance", "distanceMeters", "length"]) {
      const m = readDistanceMetersField(s[key]);
      if (m !== null) return m;
    }
  }

  const legs = r.legs;
  if (Array.isArray(legs)) {
    let sum = 0;
    let any = false;
    for (const leg of legs) {
      if (!leg || typeof leg !== "object") continue;
      const legObj = leg as Record<string, unknown>;
      const m =
        readDistanceMetersField(legObj.distance) ??
        (legObj.summary && typeof legObj.summary === "object"
          ? readDistanceMetersField((legObj.summary as Record<string, unknown>).distance)
          : null);
      if (m !== null) {
        sum += m;
        any = true;
      }
    }
    if (any && sum > 0) return sum;
  }

  return null;
}

// --- Autocomplete (for future address search UX; same endpoint as Python client) ---

export interface OlaAutocompleteOptions {
  /** `lat,lng` */
  location?: string;
  /** meters */
  radius?: number;
}

/**
 * Raw autocomplete predictions from GET /places/v1/autocomplete.
 * Wire UI later: debounce input → this → place details / geocode as needed.
 */
export async function olaAutocompletePredictions(
  input: string,
  options?: OlaAutocompleteOptions,
  preferredReferrer?: string | null,
): Promise<unknown[]> {
  const q = input.trim();
  if (q.length < 1) return [];

  const key = getOlaMapsApiKey();
  if (!key) return [];

  const u = new URL(`${OLA_BASE}/places/v1/autocomplete`);
  u.searchParams.set("api_key", key);
  u.searchParams.set("input", q);
  if (options?.location) u.searchParams.set("location", options.location);
  if (typeof options?.radius === "number") u.searchParams.set("radius", String(options.radius));
  if (options?.location && typeof options?.radius === "number") u.searchParams.set("strictbounds", "true");

  async function attemptAutocomplete(referrer: string | null | undefined): Promise<unknown[]> {
    try {
      const res = await fetch(u.toString(), {
        headers: { Accept: "application/json", ...olaReferrerHeaders(referrer) },
        next: { revalidate: 60 },
      });
      const data = (await res.json()) as Record<string, unknown>;
      const code = typeof data.status_code === "number" ? data.status_code : res.status;
      if (!res.ok || code >= 400) return [];

      const preds = data.predictions;
      return Array.isArray(preds) ? preds : [];
    } catch {
      return [];
    }
  }

  const first = await attemptAutocomplete(preferredReferrer);
  if (first.length > 0) return first;
  const alt = alternateReferrerForOla(preferredReferrer);
  if (alt) return await attemptAutocomplete(alt);
  return [];
}

// --- Nominatim fallback (no Ola key, or Ola returns no results) ---

async function nominatimPincode(pincode: string): Promise<{ lat: number; lng: number; display_name: string } | null> {
  const query = `${pincode}, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Nutravoe/1.0 (support@nutravoe.in)",
        "Accept-Language": "en",
      },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) return null;
    return {
      lat: Number.parseFloat(data[0].lat),
      lng: Number.parseFloat(data[0].lon),
      display_name: data[0].display_name,
    };
  } catch {
    return null;
  }
}

async function nominatimSearch(q: string): Promise<GeocodeHit[]> {
  const query = q.toLowerCase().includes("bengaluru") ? q : `${q}, Bengaluru, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Nutravoe/1.0 (support@nutravoe.in)",
        "Accept-Language": "en",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    return data.map((item) => ({
      lat: Number.parseFloat(item.lat),
      lng: Number.parseFloat(item.lon),
      display_name: item.display_name,
    }));
  } catch {
    return [];
  }
}

/**
 * Pincode → coordinates (Ola first, then Nominatim). Used by API routes and checkout pricing.
 */
export async function geocodeIndianPincode(
  pincode: string,
  preferredReferrer?: string | null,
): Promise<{ lat: number; lng: number; display_name?: string } | null> {
  const olaAddr = `${pincode} Bengaluru Karnataka India`;
  if (getOlaMapsApiKey()) {
    const hits = geocodeHitsFromResults(await olaGeocodeResults(olaAddr, preferredReferrer), 1);
    if (hits.length) return { lat: hits[0].lat, lng: hits[0].lng, display_name: hits[0].display_name };
  }
  const fb = await nominatimPincode(pincode);
  if (!fb) return null;
  return { lat: fb.lat, lng: fb.lng, display_name: fb.display_name };
}

function olaPredictionLabel(p: unknown): string | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (typeof o.description === "string" && o.description.length) return o.description;
  const sf = o.structured_formatting;
  if (sf && typeof sf === "object") {
    const s = sf as Record<string, unknown>;
    if (typeof s.main_text === "string") {
      const sec = typeof s.secondary_text === "string" ? `, ${s.secondary_text}` : "";
      return s.main_text + sec;
    }
  }
  return typeof o.name === "string" ? o.name : null;
}

function coordsFromPrediction(p: unknown): { lat: number; lng: number } | null {
  return coordFromUnknown(p);
}

/**
 * Map search: Ola autocomplete (+ geocode when needed), then forward geocode, else Nominatim.
 */
export async function geocodeSearchBangalore(q: string, preferredReferrer?: string | null): Promise<GeocodeHit[]> {
  const query = q.toLowerCase().includes("bengaluru") ? q : `${q} Bengaluru India`;
  if (getOlaMapsApiKey()) {
    const preds = await olaAutocompletePredictions(
      query,
      { location: "12.9716,77.5946", radius: 50_000 },
      preferredReferrer,
    );

    const direct: GeocodeHit[] = [];
    const seen = new Set<string>();
    for (const p of preds) {
      const c = coordsFromPrediction(p);
      const label = olaPredictionLabel(p);
      if (c && label) {
        const key = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        direct.push({ ...c, display_name: label });
        if (direct.length >= 5) return direct;
      }
    }

    const labels = preds
      .map(olaPredictionLabel)
      .filter((s): s is string => !!s && s.length > 2)
      .filter((s, i, a) => a.indexOf(s) === i)
      .slice(0, 5);

    if (labels.length) {
      const resolved = await Promise.all(
        labels.map(async (label) => {
          const hits = geocodeHitsFromResults(await olaGeocodeResults(`${label} India`, preferredReferrer), 1);
          return hits[0] ?? null;
        }),
      );
      const merged = [...direct, ...resolved.filter((h): h is GeocodeHit => h !== null)];
      const dedup: GeocodeHit[] = [];
      const seen2 = new Set<string>();
      for (const h of merged) {
        const key = `${h.lat.toFixed(5)},${h.lng.toFixed(5)}`;
        if (seen2.has(key)) continue;
        seen2.add(key);
        dedup.push(h);
        if (dedup.length >= 5) break;
      }
      if (dedup.length) return dedup;
    }

    const fromGeocode = geocodeHitsFromResults(await olaGeocodeResults(query, preferredReferrer), 5);
    if (fromGeocode.length) return fromGeocode;
  }
  return nominatimSearch(q);
}
