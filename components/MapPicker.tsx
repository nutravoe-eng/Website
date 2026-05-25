"use client";
import { useEffect, useRef, useState, useCallback, useId } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

interface MapPickerProps {
  centerLat?: number;
  centerLng?: number;
  onChange: (lat: number, lng: number) => void;
  onAddressSelect?: (displayName: string) => void;
  fullscreen?: boolean;
}

interface Suggestion {
  lat: number;
  lng: number;
  display_name: string;
}

type MapProvider = "ola" | "google";

/** Minimal shared surface for Ola (MapLibre) and Google Maps pickers. */
interface MapController {
  provider: MapProvider;
  setCenter(lng: number, lat: number): void;
  setMarker(lng: number, lat: number): void;
  getMarker(): { lat: number; lng: number };
  zoomIn(): void;
  zoomOut(): void;
  resize(): void;
  destroy(): void;
}

function installOlaStyleImageFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
) {
  const transparentImage = {
    width: 1,
    height: 1,
    data: new Uint8Array([0, 0, 0, 0]),
  };

  map.on?.("styleimagemissing", (event: { id?: string }) => {
    if (event?.id === undefined || event?.id === null) return;
    const id = String(event.id);
    try {
      map.addImage?.(id, transparentImage);
    } catch {
      /* ignore duplicate or unsupported image registration */
    }
  });
}

function collapseOlaAttribution(containerId: string) {
  const container = document.getElementById(containerId);
  const attribution = container?.querySelector(".maplibregl-ctrl-attrib");
  if (!(attribution instanceof HTMLElement)) return;

  attribution.classList.add("maplibregl-compact");
  attribution.classList.remove("maplibregl-compact-show");
  attribution.removeAttribute("open");
}

const BENGALURU_LAT = 12.9716;
const BENGALURU_LNG = 77.5946;
const OLA_MAX_NATIVE_ZOOM = 14;
const ZOOM = 16;
/** Standard style has 3D layers stripped by sanitizeOlaStyle; lite style is visually simpler and not used. */
const OLA_STYLE_URL_DEFAULT =
  "https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json";

/** Standard style includes 3D building layers; lite does not and should load via URL (sprites). */
function olaStyleNeedsSanitizedObject(styleUrl: string): boolean {
  return /default-light-standard|default-dark-standard/i.test(styleUrl);
}
const MARKER_COLOR = "#C4714A";
/** Google demo map ID — works without creating a Map ID in Cloud Console. Override via NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID. */
const GOOGLE_MAP_ID_FALLBACK = "DEMO_MAP_ID";

function getGoogleMapId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || GOOGLE_MAP_ID_FALLBACK;
}

function getOlaPublicKey(): string | undefined {
  return process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY?.trim();
}

function getGooglePublicKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || undefined;
}

function clearMapContainer(container: HTMLElement) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.className = container.className
    .split(/\s+/)
    .filter((c) => c && !c.startsWith("maplibregl-"))
    .join(" ");
}

function stripNullDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    // Do NOT filter null from arrays — null is valid in MapLibre style expressions
    // (e.g. ["match", ..., null] fallback, ["interpolate", ..., 14, null, ...] stop-value).
    // Removing nulls from expression arrays produces syntactically broken expressions.
    return value.map((item) => stripNullDeep(item)) as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === null) continue;
      out[key] = stripNullDeep(val);
    }
    return out as T;
  }
  return value;
}

function sanitizeOlaStyle(style: unknown): unknown {
  if (!style || typeof style !== "object") return style;

  const styleObj = structuredClone(style) as {
    layers?: Array<Record<string, unknown>>;
    sources?: Record<string, Record<string, unknown>>;
    terrain?: unknown;
    fog?: unknown;
    sky?: unknown;
  };

  // Ola's default style currently includes terrain / 3D config that can cause
  // MapLibre worker parse failures in the browser ("expected number, found null").
  delete styleObj.terrain;
  delete styleObj.fog;
  delete styleObj.sky;

  if (styleObj.sources && typeof styleObj.sources === "object") {
    styleObj.sources = Object.fromEntries(
      Object.entries(styleObj.sources).filter(([, source]) => {
        const type = typeof source?.type === "string" ? source.type.toLowerCase() : "";
        return type !== "raster-dem";
      }),
    );
  }

  if (!Array.isArray(styleObj.layers)) return stripNullDeep(styleObj);

  const sourceIds = new Set(Object.keys(styleObj.sources ?? {}));

  styleObj.layers = styleObj.layers.filter((layer) => {
    const id = typeof layer.id === "string" ? layer.id : "";
    const type = typeof layer.type === "string" ? layer.type.toLowerCase() : "";
    const source = typeof layer.source === "string" ? layer.source : null;
    const sourceLayer = typeof layer["source-layer"] === "string" ? layer["source-layer"] : null;
    const lowerId = id.toLowerCase();
    const lowerSourceLayer = (sourceLayer ?? "").toLowerCase();

    if (source && !sourceIds.has(source)) return false;
    if (lowerId.includes("3d")) return false;
    if (lowerId.includes("terrain")) return false;
    if (lowerId.includes("hillshade")) return false;
    if (lowerSourceLayer.includes("3d")) return false;
    if (lowerSourceLayer === "3d_model") return false;
    if (type === "fill-extrusion" || type === "hillshade" || type === "sky") return false;
    return true;
  });

  return stripNullDeep(styleObj);
}

function assertValidOlaStylePayload(styleJson: unknown): void {
  if (!styleJson || typeof styleJson !== "object") {
    throw new Error("Ola Maps style response was not JSON");
  }
  const payload = styleJson as { message?: unknown; layers?: unknown };
  if (typeof payload.message === "string" && payload.message.trim()) {
    throw new Error(`Ola Maps style rejected: ${payload.message.trim()}`);
  }
  if (!Array.isArray(payload.layers) || payload.layers.length === 0) {
    throw new Error(
      "Ola Maps style has no layers. Add this site's origin to your Ola API key domain allowlist (e.g. https://nutravoe.in).",
    );
  }
}

function disableOlaTerrainAnd3d(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
) {
  try {
    map.setTerrain?.(null);
    map.setPitch?.(0);
    map.setMaxPitch?.(0);
  } catch {
    /* ignore unsupported MapLibre APIs */
  }
  for (const layerId of ["building-3d", "3d_model_data"]) {
    try {
      if (map.getLayer?.(layerId)) {
        map.setLayoutProperty?.(layerId, "visibility", "none");
      }
    } catch {
      /* layer may already be removed from sanitized style */
    }
  }
}

function isBenignOlaMapError(event: unknown): boolean {
  const parts: string[] = [];
  if (typeof event === "string") parts.push(event);
  if (event instanceof Error) parts.push(event.message);
  if (event && typeof event === "object") {
    const o = event as Record<string, unknown>;
    if (o.error instanceof Error) parts.push(o.error.message);
    else if (typeof o.error === "string") parts.push(o.error);
    if (typeof o.message === "string") parts.push(o.message);
  }
  const msg = parts.join(" ");
  return (
    msg.includes("Expected value to be of type number") ||
    msg.includes("expected number") ||
    msg.includes("styleimagemissing") ||
    msg.includes("could not be loaded") ||
    msg.includes("addImage") ||
    msg.includes("Missing required image") ||
    msg.includes("does not exist on source") ||
    msg.includes("Source layer")
  );
}

async function loadSanitizedOlaStyle(styleUrl: string, apiKey: string): Promise<unknown> {
  const url = new URL(styleUrl);
  url.searchParams.append("api_key", apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load Ola style (${response.status})`);
  }

  const styleJson: unknown = await response.json();
  assertValidOlaStylePayload(styleJson);
  return sanitizeOlaStyle(styleJson);
}

/**
 * Ola SDK calls `options.style?.includes("dark")` for logo styling — style must be a
 * URL string OR an object with a string-like `.includes`. Inline sanitized JSON needs this shim.
 */
function wrapStyleForOlaSdk(style: unknown, styleUrl: string): unknown {
  if (typeof style === "string") return style;
  if (!style || typeof style !== "object") return style;
  const target = style as { includes?: (fragment: string) => boolean };
  if (typeof target.includes === "function") return style;
  Object.defineProperty(style, "includes", {
    value: (fragment: string) => styleUrl.includes(String(fragment)),
    enumerable: false,
    configurable: true,
  });
  return style;
}

/**
 * Detect a genuinely blank Ola map (domain/tile failure). Non-fatal MapLibre tile parse
 * warnings must not trigger Google fallback — those were tolerated when Ola was primary.
 */
function mapContainerHasVisibleSize(containerId: string): boolean {
  const el = document.getElementById(containerId);
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= 8 && rect.height >= 8;
}

function olaMapTilesHealthy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  containerId: string,
  timeoutMs = 15000,
): Promise<boolean> {
  if (!mapContainerHasVisibleSize(containerId)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    const fail = () => {
      clearTimeout(timer);
      finish(false);
    };

    map.on?.("error", (e: unknown) => {
      if (isBenignOlaMapError(e)) {
        console.warn("[MapPicker] Ola non-fatal tile/style warning (ignored):", e);
        return;
      }
      console.warn("[MapPicker] Ola map error:", e);
      fail();
    });

    const onIdle = () => {
      if (typeof map.areTilesLoaded === "function" && !map.areTilesLoaded()) {
        setTimeout(onIdle, 700);
        return;
      }
      // Wait for MapLibre to flush the WebGL frame before sampling rendered features.
      // areTilesLoaded() returns true even when every tile failed (e.g. terrain broke the
      // rendering pipeline) — queryRenderedFeatures() is the only reliable blank-map check.
      requestAnimationFrame(() => {
        clearTimeout(timer);
        if (typeof map.queryRenderedFeatures === "function") {
          const features: unknown[] = map.queryRenderedFeatures() ?? [];
          if (features.length === 0) {
            console.warn("[MapPicker] Ola idle but 0 features rendered — blank map, falling back to Google Maps");
            finish(false);
            return;
          }
        }
        finish(true);
      });
    };

    if (map.loaded?.()) {
      map.once?.("idle", onIdle);
      setTimeout(onIdle, 0);
      map.triggerRepaint?.();
    } else {
      map.once?.("load", () => map.once?.("idle", onIdle));
    }
  });
}

async function initOlaMap(
  containerId: string,
  center: [number, number],
  onPinMove: (lat: number, lng: number) => void,
): Promise<{ controller: MapController; map: unknown }> {
  const { OlaMaps, defaultStyleJson } = await import("olamaps-web-sdk");
  const apiKey = getOlaPublicKey()!;
  const ola = new OlaMaps({ apiKey, mode: "2d", threedTileset: "" });

  const map = await ola.init({
    container: containerId,
    center,
    zoom: ZOOM,
    style: defaultStyleJson,
  });

  // The Ola SDK always passes a URL to MapLibre regardless of the style option, and that
  // URL's style includes terrain. When terrain initialises but the raster-dem source has no
  // data in Ola's tile servers, MapLibre's rendering pipeline breaks → blank canvas.
  //
  // Fix: call map.setStyle(object) directly on the MapLibre instance after init. MapLibre's
  // setStyle(object) calls _load internally — no network request, no terrain. This replaces
  // the broken URL-fetched style and triggers a fresh 2-D tile load.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapAny = map as any;
  disableOlaTerrainAnd3d(map);
  if (typeof mapAny.setStyle === "function") {
    await new Promise<void>((resolve) => {
      const safety = setTimeout(resolve, 1500);
      mapAny.once?.("style.load", () => {
        clearTimeout(safety);
        resolve();
      });
      mapAny.setStyle(sanitizeOlaStyle(defaultStyleJson));
    });
    disableOlaTerrainAnd3d(map);
  }

  const resizeMap = () => {
    try {
      map.resize?.();
      map.triggerRepaint?.();
    } catch {
      /* ignore */
    }
  };

  installOlaStyleImageFallback(map);
  map.on?.("load", () => {
    disableOlaTerrainAnd3d(map);
    collapseOlaAttribution(containerId);
    resizeMap();
    requestAnimationFrame(() => resizeMap());
    setTimeout(() => resizeMap(), 150);
  });
  map.on?.("style.load", () => disableOlaTerrainAnd3d(map));
  setTimeout(() => collapseOlaAttribution(containerId), 0);

  map.scrollZoom.disable();

  const marker = new OlaMaps.Marker({ color: MARKER_COLOR, draggable: true })
    .setLngLat(center)
    .addTo(map);

  marker.on("dragend", () => {
    const ll = marker.getLngLat();
    onPinMove(ll.lat, ll.lng);
  });

  map.on("click", (e: { lngLat: { lat: number; lng: number } }) => {
    marker.setLngLat(e.lngLat);
    onPinMove(e.lngLat.lat, e.lngLat.lng);
  });

  const controller: MapController = {
    provider: "ola",
    setCenter(lng, lat) {
      map.setCenter([lng, lat]);
    },
    setMarker(lng, lat) {
      marker.setLngLat({ lng, lat });
      map.setCenter([lng, lat]);
    },
    getMarker() {
      const ll = marker.getLngLat();
      return { lat: ll.lat, lng: ll.lng };
    },
    zoomIn() {
      map.zoomIn?.();
    },
    zoomOut() {
      map.zoomOut?.();
    },
    resize() {
      resizeMap();
    },
    destroy() {
      const suppressAbort = (e: PromiseRejectionEvent) => {
        if (e.reason?.name === "AbortError") e.preventDefault();
      };
      window.addEventListener("unhandledrejection", suppressAbort, { capture: true });
      try {
        map.remove();
      } catch {
        /* ignore */
      }
      setTimeout(() => window.removeEventListener("unhandledrejection", suppressAbort, { capture: true }), 300);
    },
  };

  return { controller, map };
}

const GOOGLE_MAPS_BLOCKED_HELP =
  "Enable Maps JavaScript API in Google Cloud, then edit your API key → API restrictions → add Maps JavaScript API (your key may only allow Routes/Geocoding/Places for server use). For the browser, also set HTTP referrer allowlist: http://localhost:3000/* and https://nutravoe.in/*";

function installGoogleMapsAuthFailureHandler(onFail: () => void): () => void {
  type Win = Window & { gm_authFailure?: () => void };
  const win = window as Win;
  const prev = win.gm_authFailure;
  win.gm_authFailure = () => {
    prev?.();
    onFail();
  };
  return () => {
    win.gm_authFailure = prev;
  };
}

function googleMapHasVisibleError(container: HTMLElement): boolean {
  return Boolean(
    container.querySelector(".gm-err-container") ||
      container.textContent?.includes("didn't load Google Maps correctly"),
  );
}

function readAdvancedMarkerPosition(
  marker: google.maps.marker.AdvancedMarkerElement,
): { lat: number; lng: number } | null {
  const p = marker.position;
  if (!p) return null;
  if (typeof (p as google.maps.LatLng).lat === "function") {
    const ll = p as google.maps.LatLng;
    return { lat: ll.lat(), lng: ll.lng() };
  }
  const lit = p as google.maps.LatLngLiteral;
  return { lat: lit.lat, lng: lit.lng };
}

async function initGoogleMap(
  container: HTMLElement,
  center: { lat: number; lng: number },
  onPinMove: (lat: number, lng: number) => void,
): Promise<MapController> {
  const apiKey = getGooglePublicKey();
  if (!apiKey) {
    throw new Error("Missing Google Maps browser key. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local.");
  }

  let authFailed = false;
  const restoreAuthFailure = installGoogleMapsAuthFailureHandler(() => {
    authFailed = true;
  });

  setOptions({ key: apiKey, v: "weekly" });
  const { Map } = await importLibrary("maps");
  const { AdvancedMarkerElement, PinElement } = await importLibrary("marker");

  const map = new Map(container, {
    center,
    zoom: ZOOM,
    mapId: getGoogleMapId(),
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  });

  const pin = new PinElement({
    background: MARKER_COLOR,
    borderColor: MARKER_COLOR,
    glyphColor: "#FFFFFF",
  });

  const marker = new AdvancedMarkerElement({
    map,
    position: center,
    gmpDraggable: true,
    title: "Drag to set delivery location",
  });
  marker.append(pin);

  marker.addListener("dragend", () => {
    const pos = readAdvancedMarkerPosition(marker);
    if (!pos) return;
    onPinMove(pos.lat, pos.lng);
  });

  map.addListener("click", (e: google.maps.MapMouseEvent) => {
    const pos = e.latLng;
    if (!pos) return;
    marker.position = { lat: pos.lat(), lng: pos.lng() };
    onPinMove(pos.lat(), pos.lng());
  });

  await new Promise((resolve) => setTimeout(resolve, 800));
  if (authFailed || googleMapHasVisibleError(container)) {
    marker.map = null;
    throw new Error(`ApiTargetBlockedMapError: ${GOOGLE_MAPS_BLOCKED_HELP}`);
  }

  return {
    provider: "google",
    setCenter(lng, lat) {
      map.setCenter({ lat, lng });
    },
    setMarker(lng, lat) {
      const pos = { lat, lng };
      marker.position = pos;
      map.setCenter(pos);
    },
    getMarker() {
      const pos = readAdvancedMarkerPosition(marker);
      if (!pos) return { lat: center.lat, lng: center.lng };
      return pos;
    },
    zoomIn() {
      const z = map.getZoom();
      if (typeof z === "number") map.setZoom(z + 1);
    },
    zoomOut() {
      const z = map.getZoom();
      if (typeof z === "number") map.setZoom(z - 1);
    },
    resize() {
      const pos = readAdvancedMarkerPosition(marker) ?? center;
      google.maps.event.trigger(map, "resize");
      map.setCenter(pos);
    },
    destroy() {
      marker.map = null;
      restoreAuthFailure();
    },
  };
}

export default function MapPicker({ centerLat, centerLng, onChange, onAddressSelect, fullscreen }: MapPickerProps) {
  const mapContainerId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapControllerRef = useRef<MapController | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapProvider, setMapProvider] = useState<MapProvider | null>(null);

  const initialCenterRef = useRef<{ lat: number; lng: number }>({
    lat: centerLat ?? BENGALURU_LAT,
    lng: centerLng ?? BENGALURU_LNG,
  });

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;

    const onPinMove = (lat: number, lng: number) => {
      onChangeRef.current(lat, lng);
    };

    (async () => {
      setMapError(null);
      setMapProvider(null);

      const center = initialCenterRef.current;
      const olaKey = getOlaPublicKey();
      const googleKey = getGooglePublicKey();
      if (process.env.NODE_ENV === "development") {
        console.info("[MapPicker] Booting map", {
          mapContainerId,
          fullscreen: Boolean(fullscreen),
          center,
          hasOlaKey: Boolean(olaKey),
          hasGoogleKey: Boolean(googleKey),
        });
      }

      if (!olaKey && !googleKey) {
        setMapError(
          "Add NEXT_PUBLIC_OLA_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local to show the map.",
        );
        return;
      }

      if (!containerRef.current) return;

      const tryGoogle = async (reason: string, destroyPrevious?: MapController) => {
        if (!googleKey || cancelled) return false;
        console.warn("[MapPicker] Attempting Google fallback", {
          reason,
          mapContainerId,
        });
        destroyPrevious?.destroy();
        if (containerRef.current) clearMapContainer(containerRef.current);
        try {
          const controller = await initGoogleMap(containerRef.current!, center, onPinMove);
          if (cancelled) {
            controller.destroy();
            return false;
          }
          mapControllerRef.current = controller;
          setMapProvider("google");
          setMapError(null);
          console.info(`[MapPicker] Using Google Maps (${reason})`);
          onPinMove(center.lat, center.lng);
          return true;
        } catch (e) {
          console.error("Google Maps init:", e);
          if (containerRef.current) clearMapContainer(containerRef.current);
          setMapProvider(null);
          const msg = e instanceof Error ? e.message : "";
          if (msg.includes("ApiTargetBlockedMapError") || msg.includes("Maps JavaScript")) {
            setMapError(GOOGLE_MAPS_BLOCKED_HELP);
          }
          return false;
        }
      };

      if (olaKey) {
        try {
          const { controller: olaController, map: olaMap } = await initOlaMap(
            mapContainerId,
            [center.lng, center.lat],
            onPinMove,
          );
          console.info("[MapPicker] Ola init succeeded", { mapContainerId, center });
          if (cancelled) {
            olaController.destroy();
            return;
          }
          olaController.resize();

          const tilesOk = await olaMapTilesHealthy(olaMap, mapContainerId);
          if (cancelled) {
            olaController.destroy();
            return;
          }

          if (!tilesOk) {
            console.warn("[MapPicker] Ola initialized but did not render tiles — switching to Google Maps", {
              mapContainerId,
            });
            const googleOk = await tryGoogle("Ola map did not render", olaController);
            if (googleOk) return;
            olaController.destroy();
          } else {
            mapControllerRef.current = olaController;
            setMapProvider("ola");
            onPinMove(center.lat, center.lng);
            return;
          }
        } catch (e) {
          console.error("[MapPicker] OlaMaps init failed — falling back to Google:", e);
          const googleOk = await tryGoogle("Ola Maps failed to initialize");
          if (googleOk) return;
        }
      } else {
        const googleOk = await tryGoogle("Ola key not configured");
        if (googleOk) return;
      }

      if (!cancelled) {
        setMapError(
          "Could not load the map. Check Ola/Google API keys and domain allowlists (Maps JavaScript API for Google).",
        );
      }
    })();

    return () => {
      cancelled = true;
      mapControllerRef.current?.destroy();
      mapControllerRef.current = null;
    };
  }, [mapContainerId]);

  useEffect(() => {
    const controller = mapControllerRef.current;
    if (!controller || centerLat == null || centerLng == null) return;
    controller.setCenter(centerLng, centerLat);
    controller.setMarker(centerLng, centerLat);
    onChangeRef.current(centerLat, centerLng);
  }, [centerLat, centerLng]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const notifyResize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      if (process.env.NODE_ENV === "development") {
        console.info("[MapPicker] Container resize check", {
          mapContainerId,
          fullscreen: Boolean(fullscreen),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
      requestAnimationFrame(() => {
        mapControllerRef.current?.resize();
      });
    };

    notifyResize();
    const timeoutId = window.setTimeout(notifyResize, 180);
    const observer = new ResizeObserver(() => {
      notifyResize();
    });
    observer.observe(container);

    return () => {
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [fullscreen, mapContainerId]);

  const handleSearchChange = useCallback((value: string) => {
    setQuery(value);
    setSuggestions([]);
    setSearchError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setShowSuggestions(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          setSuggestions([]);
          setShowSuggestions(false);
          if (res.status === 429) {
            setSearchError("Too many searches. Please wait a moment.");
          } else if (res.status === 400) {
            setSearchError("Search text is too long. Try a shorter address.");
          } else {
            setSearchError("Address search unavailable. Move the pin or try again.");
          }
          return;
        }
        const data: unknown = await res.json();
        const hits = Array.isArray(data) ? (data as Suggestion[]) : [];
        setSuggestions(hits);
        setShowSuggestions(hits.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
        setSearchError("Address search unavailable. Move the pin or try again.");
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const handleSelect = useCallback(
    (s: Suggestion) => {
      setQuery(s.display_name.split(",")[0]);
      setSuggestions([]);
      setShowSuggestions(false);

      const controller = mapControllerRef.current;
      if (!controller) return;
      controller.setMarker(s.lng, s.lat);
      onAddressSelect?.(s.display_name);
      onChange(s.lat, s.lng);
    },
    [onChange, onAddressSelect],
  );

  const handleZoomIn = useCallback(() => {
    try {
      mapControllerRef.current?.zoomIn();
    } catch {
      /* ignore */
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    try {
      mapControllerRef.current?.zoomOut();
    } catch {
      /* ignore */
    }
  }, []);

  const handleResetView = useCallback(() => {
    try {
      const { lat, lng } = initialCenterRef.current;
      mapControllerRef.current?.setMarker(lng, lat);
      onChangeRef.current(lat, lng);
    } catch {
      /* ignore */
    }
  }, []);

  const handleLocateMe = useCallback(() => {
    setLocationError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Location is not supported on this device/browser.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        initialCenterRef.current = { lat, lng };
        setShowSuggestions(false);
        setSuggestions([]);

        try {
          mapControllerRef.current?.setMarker(lng, lat);
        } catch {
          /* coordinates still saved */
        }

        onChangeRef.current(lat, lng);
        setLocating(false);
      },
      (err) => {
        let message = "Could not fetch your location. Try search or move the pin manually.";
        if (err.code === err.PERMISSION_DENIED) {
          message = "Location permission denied. Use search or move the pin manually.";
        }
        if (err.code === err.TIMEOUT) message = "Location lookup timed out. Please try again.";
        setLocationError(message);
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  }, []);

  if (fullscreen) {
    return (
      <div className="h-full relative">
        {/* Search card — floats over the map */}
        <div className="absolute top-3 left-3 right-3 z-10">
          <div className="relative">
            <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.13)] flex items-center px-4 py-3 gap-3">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-sage"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search for area or street name…"
                className="flex-1 font-body text-[14px] text-ink placeholder:text-stone/55 outline-none bg-transparent"
              />
              {searching && (
                <div className="w-3.5 h-3.5 shrink-0 rounded-full border-2 border-sage border-t-transparent animate-spin" />
              )}
              {query && !searching && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setQuery("");
                    setSuggestions([]);
                    setShowSuggestions(false);
                    setSearchError(null);
                  }}
                  className="shrink-0 text-stone hover:text-ink"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] overflow-hidden max-h-52 overflow-y-auto z-20">
                {suggestions.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(s);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-[#F9F8F6] transition-colors flex items-start gap-3 border-b border-black/5 last:border-0"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sage shrink-0 mt-0.5">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span className="font-body text-[13px] text-ink leading-relaxed line-clamp-2">{s.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(locationError || searchError) && (
            <p className="font-body text-[11px] text-terracotta mt-2 px-1">{locationError ?? searchError}</p>
          )}
        </div>

        {/* Map fills the entire area */}
        {mapError ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#F9F8F6]">
            <p className="font-body text-[13px] text-stone text-center">{mapError}</p>
          </div>
        ) : (
          <div className="absolute inset-0" style={{ zIndex: 0 }}>
            <div
              ref={containerRef}
              id={mapContainerId}
              className="h-full w-full"
              style={{ height: "100%", width: "100%" }}
            />
          </div>
        )}

        {/* "Use current location" pill — floats over the map */}
        {!mapError && (
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locating}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2.5 bg-white border border-sage rounded-full px-5 py-2.5 shadow-md font-body text-[13px] font-medium text-sage whitespace-nowrap disabled:opacity-60 transition-opacity"
            aria-label="Use current location"
          >
            {locating ? (
              <div className="w-4 h-4 rounded-full border-2 border-sage border-t-transparent animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
              </svg>
            )}
            Use current location
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locating}
            className="h-[38px] w-[38px] shrink-0 rounded-md border border-black/15 bg-white text-stone hover:text-ink hover:border-sage transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            aria-label="Locate me"
            title="Locate me"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v3" />
              <path d="M12 19v3" />
              <path d="M2 12h3" />
              <path d="M19 12h3" />
            </svg>
          </button>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 text-stone pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search for a street, landmark, or area…"
            className="w-full border border-black/20 rounded-md pl-9 pr-8 py-2 font-body text-sm outline-none focus:border-sage transition-all bg-white focus-visible:ring-2 focus-visible:ring-sage"
          />
          {searching && (
            <div className="absolute right-3 w-3.5 h-3.5 rounded-full border-2 border-sage border-t-transparent animate-spin" />
          )}
          {query && !searching && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery("");
                setSuggestions([]);
                setShowSuggestions(false);
                setSearchError(null);
              }}
              className="absolute right-3 text-stone hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage rounded-sm"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
        {(locationError || searchError) && (
          <p className="font-body text-[11px] text-terracotta mt-1">{locationError ?? searchError}</p>
        )}

        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-[1000] top-full left-0 right-0 mt-1 bg-white border border-black/10 rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(s);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-[#F9F8F6] transition-colors flex items-start gap-2.5 border-b border-black/5 last:border-0"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-sage shrink-0 mt-0.5"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="font-body text-[12.5px] text-ink leading-relaxed line-clamp-2">{s.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mapError ? (
        <div className="w-full rounded-lg border border-black/10 bg-[#F9F8F6] px-3 py-4 font-body text-[13px] text-stone">{mapError}</div>
      ) : (
        <div className="relative">
          <div
            ref={containerRef}
            id={mapContainerId}
            className="w-full rounded-lg border border-black/10 overflow-hidden"
            style={{ height: "240px", zIndex: 0 }}
          />
          {mapProvider === "google" && (
            <p className="font-body text-[10px] text-stone/80 mt-1">
              Map loaded via Google (Ola Maps unavailable).
            </p>
          )}
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleZoomIn}
              className="w-8 h-8 rounded-md border border-black/10 bg-white/95 text-ink shadow-sm hover:bg-white transition-colors font-body text-lg leading-none"
              aria-label="Zoom in"
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="w-8 h-8 rounded-md border border-black/10 bg-white/95 text-ink shadow-sm hover:bg-white transition-colors font-body text-lg leading-none"
              aria-label="Zoom out"
              title="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="px-2 h-8 rounded-md border border-black/10 bg-white/95 text-ink shadow-sm hover:bg-white transition-colors font-body text-[11px] font-medium tracking-wide"
              aria-label="Reset map view"
              title="Reset map view"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
