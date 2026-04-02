"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMap = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMarker = any;

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
const MARKER_ICON_URL = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="42" viewBox="0 0 28 42">
  <path fill="#C4714A" stroke="#8D4B2E" stroke-width="1.5" d="M14 1C7.373 1 2 6.373 2 13c0 8.75 12 28 12 28s12-19.25 12-28C26 6.373 20.627 1 14 1Z"/>
  <circle cx="14" cy="13" r="5" fill="white"/>
</svg>
`)}`;

export default function MapPicker({ centerLat, centerLng, onChange }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Initialize map once on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import("leaflet").then((L) => {
      if (!containerRef.current || mapRef.current) return;

      const markerIcon = L.icon({
        iconUrl: MARKER_ICON_URL,
        iconSize: [28, 42],
        iconAnchor: [14, 42],
        popupAnchor: [0, -36],
      });

      const center: [number, number] =
        centerLat && centerLng ? [centerLat, centerLng] : BENGALURU;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
      }).setView(center, ZOOM);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker(center, { draggable: true, icon: markerIcon }).addTo(map);
      marker.bindPopup("Drag me to your exact location").openPopup();

      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        onChange(lat, lng);
      });

      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        onChange(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      onChange(center[0], center[1]);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-center when geocoded location arrives from pincode
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !centerLat || !centerLng) return;
    const pos: [number, number] = [centerLat, centerLng];
    mapRef.current.setView(pos, ZOOM, { animate: true });
    markerRef.current.setLatLng(pos);
    onChange(centerLat, centerLng);
  }, [centerLat, centerLng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
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

  const handleSelect = useCallback((s: Suggestion) => {
    setQuery(s.display_name.split(",")[0]);
    setSuggestions([]);
    setShowSuggestions(false);

    if (!mapRef.current || !markerRef.current) return;
    const pos: [number, number] = [s.lat, s.lng];
    mapRef.current.setView(pos, ZOOM, { animate: true });
    markerRef.current.setLatLng(pos);
    onChange(s.lat, s.lng);
  }, [onChange]);

  return (
    <div className="flex flex-col gap-2">
      {/* Search bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3 text-stone pointer-events-none"
          >
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
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
              onMouseDown={(e) => { e.preventDefault(); setQuery(""); setSuggestions([]); setShowSuggestions(false); }}
              className="absolute right-3 text-stone hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage rounded-sm"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-[1000] top-full left-0 right-0 mt-1 bg-white border border-black/10 rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-[#F9F8F6] transition-colors flex items-start gap-2.5 border-b border-black/5 last:border-0"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sage shrink-0 mt-0.5">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span className="font-body text-[12.5px] text-ink leading-relaxed line-clamp-2">
                    {s.display_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        className="w-full rounded-lg border border-black/10 overflow-hidden"
        style={{ height: "240px", zIndex: 0 }}
      />
    </div>
  );
}
