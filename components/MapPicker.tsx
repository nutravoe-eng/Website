"use client";
import { useEffect, useRef, useState, useCallback, useId } from "react";

interface MapPickerProps {
  centerLat?: number;
  centerLng?: number;
  onChange: (lat: number, lng: number) => void;
}

interface Suggestion {
  lat: number;
  lng: number;
  display_name: string;
}

const BENGALURU: [number, number] = [12.9716, 77.5946];
const ZOOM = 16;

export default function MapPicker({ centerLat, centerLng, onChange }: MapPickerProps) {
  const mapContainerId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const initialCenterRef = useRef<[number, number]>(
    centerLat != null && centerLng != null ? [centerLng, centerLat] : [BENGALURU[1], BENGALURU[0]],
  );

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY?.trim();
    if (!apiKey) {
      setMapError("Add NEXT_PUBLIC_OLA_MAPS_API_KEY to .env.local (same value as OLA_MAPS_API_KEY) to show the map.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { OlaMaps, defaultStyleJson } = await import("olamaps-web-sdk");
        if (cancelled || !containerRef.current) return;

        const ola = new OlaMaps({ apiKey });
        const map = await ola.init({
          container: mapContainerId,
          center: initialCenterRef.current,
          zoom: ZOOM,
          style: defaultStyleJson,
        });

        if (cancelled) {
          map.remove();
          return;
        }

        map.scrollZoom.disable();

        const marker = new OlaMaps.Marker({ color: "#C4714A", draggable: true })
          .setLngLat(initialCenterRef.current)
          .addTo(map);

        marker.on("dragend", () => {
          const ll = marker.getLngLat();
          onChangeRef.current(ll.lat, ll.lng);
        });

        map.on("click", (e: { lngLat: { lat: number; lng: number } }) => {
          marker.setLngLat(e.lngLat);
          onChangeRef.current(e.lngLat.lat, e.lngLat.lng);
        });

        mapRef.current = map;
        markerRef.current = marker;

        onChangeRef.current(initialCenterRef.current[1], initialCenterRef.current[0]);
      } catch (e) {
        console.error("OlaMaps init:", e);
        setMapError("Could not load Ola Maps. Check your API key and domain allowlist.");
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        // OlaMaps/MapLibre aborts in-flight tile requests on remove(), which fires an async
        // AbortError rejection that escapes try-catch. Suppress it for 300ms then clean up.
        const suppressAbort = (e: PromiseRejectionEvent) => {
          if (e.reason?.name === 'AbortError') e.preventDefault();
        };
        window.addEventListener('unhandledrejection', suppressAbort, { capture: true });
        try { mapRef.current.remove(); } catch { /* ignore */ }
        setTimeout(() => window.removeEventListener('unhandledrejection', suppressAbort, { capture: true }), 300);
        mapRef.current = null;
      }
      markerRef.current = null;
    };
  }, [mapContainerId]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || centerLat == null || centerLng == null) return;
    const pos: [number, number] = [centerLng, centerLat];
    mapRef.current.setCenter(pos);
    markerRef.current.setLngLat(pos);
    onChangeRef.current(centerLat, centerLng);
  }, [centerLat, centerLng]);

  const handleSearchChange = useCallback((value: string) => {
    setQuery(value);
    setSuggestions([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setShowSuggestions(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(value.trim())}`);
        const data: Suggestion[] = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
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

      if (!mapRef.current || !markerRef.current) return;
      const pos: [number, number] = [s.lng, s.lat];
      mapRef.current.setCenter(pos);
      markerRef.current.setLngLat(pos);
      onChange(s.lat, s.lng);
    },
    [onChange],
  );

  const handleZoomIn = useCallback(() => {
    try {
      mapRef.current?.zoomIn?.();
    } catch {
      /* ignore map control errors */
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    try {
      mapRef.current?.zoomOut?.();
    } catch {
      /* ignore map control errors */
    }
  }, []);

  const handleResetView = useCallback(() => {
    try {
      const [lng, lat] = initialCenterRef.current;
      const pos: [number, number] = [lng, lat];
      mapRef.current?.setCenter?.(pos);
      markerRef.current?.setLngLat?.(pos);
      onChangeRef.current(lat, lng);
    } catch {
      /* ignore map control errors */
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
        const pos: [number, number] = [lng, lat];

        initialCenterRef.current = pos;
        setShowSuggestions(false);
        setSuggestions([]);

        try {
          mapRef.current?.setCenter?.(pos);
          markerRef.current?.setLngLat?.(pos);
        } catch {
          // Ignore map move errors; coordinates are still saved via onChange.
        }

        onChangeRef.current(lat, lng);
        setLocating(false);
      },
      (err) => {
        let message = "Could not fetch your location. Try search or move the pin manually.";
        if (err.code === err.PERMISSION_DENIED) message = "Location permission denied. Use search or move the pin manually.";
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
        {locationError && (
          <p className="font-body text-[11px] text-terracotta mt-1">
            {locationError}
          </p>
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
