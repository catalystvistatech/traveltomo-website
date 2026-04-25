"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Search } from "lucide-react";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

/**
 * Single prediction returned by `/v1/places/autocomplete`.
 */
export interface PlacePrediction {
  placeId: string;
  name: string;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  category: string | null;
}

export interface BusinessLocationValue {
  name?: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  google_place_id?: string | null;
}

interface Props {
  value: BusinessLocationValue;
  onChange: (patch: Partial<BusinessLocationValue>) => void;
  biasLat?: number | null;
  biasLng?: number | null;
}

/**
 * Merchant-facing location picker:
 *   - Debounced Google Places autocomplete dropdown (server-side proxy)
 *   - Interactive Google Maps preview that updates on every selection
 *   - Draggable marker for fine-tuning (updates lat/lng on drag end)
 *   - Manual coordinate entry fallback for off-Google businesses
 */
export function BusinessLocationPicker({
  value,
  onChange,
  biasLat,
  biasLng,
}: Props) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [manualOverride, setManualOverride] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestQueryRef = useRef(0);

  const biasLatitude = biasLat ?? value.latitude ?? null;
  const biasLongitude = biasLng ?? value.longitude ?? null;

  // Debounced autocomplete -- 300 ms, stale-request guard via requestId.
  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++latestQueryRef.current;

    if (trimmed.length < 2) {
      queueMicrotask(() => {
        if (requestId !== latestQueryRef.current) return;
        setPredictions([]);
        setSearchError(null);
      });
      return;
    }

    const timeout = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (biasLatitude != null && biasLongitude != null) {
          params.set("lat", String(biasLatitude));
          params.set("lng", String(biasLongitude));
        }
        const res = await fetch(`/v1/places/autocomplete?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data?: PlacePrediction[] };
        if (requestId !== latestQueryRef.current) return;
        setPredictions(json.data ?? []);
        setShowResults(true);
      } catch (error) {
        if (requestId !== latestQueryRef.current) return;
        setSearchError(
          error instanceof Error ? error.message : "Search failed"
        );
        setPredictions([]);
      } finally {
        if (requestId === latestQueryRef.current) setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, biasLatitude, biasLongitude]);

  // Dismiss dropdown on outside click.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (prediction: PlacePrediction) => {
      const patch: Partial<BusinessLocationValue> = {
        address: prediction.address ?? prediction.name,
        city: prediction.city ?? value.city,
        latitude: prediction.lat,
        longitude: prediction.lng,
        google_place_id: prediction.placeId,
      };
      if (!value.name || value.name.trim().length === 0) {
        patch.name = prediction.name;
      }
      onChange(patch);
      setQuery("");
      setShowResults(false);
      setPredictions([]);
      setManualOverride(false);
    },
    [onChange, value.city, value.name]
  );

  // Show map once a location has been selected (via autocomplete or manual entry).
  const hasPin =
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    !(value.latitude === 0 && value.longitude === 0) &&
    !!(value.google_place_id || value.address?.trim());

  const center = hasPin
    ? { lat: value.latitude, lng: value.longitude }
    : null;

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* ?? Search ?? */}
      <div className="space-y-2">
        <Label className="text-zinc-300">Search for your business *</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (predictions.length > 0) setShowResults(true);
            }}
            placeholder="e.g. Mala Malatang, Angeles City"
            className="bg-zinc-800 border-zinc-700 text-white pl-9 h-10"
            autoComplete="off"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-500" />
          )}
        </div>

        {/* ?? Dropdown ?? */}
        {showResults && predictions.length > 0 && (
          <div
            role="listbox"
            className="rounded-lg border border-zinc-800 bg-zinc-900 shadow-lg overflow-hidden z-50 relative"
          >
            {predictions.map((prediction) => (
              <button
                key={prediction.placeId}
                type="button"
                onClick={() => handleSelect(prediction)}
                className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">
                    {prediction.name}
                  </div>
                  {prediction.address && (
                    <div className="truncate text-xs text-zinc-400">
                      {prediction.address}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {showResults &&
          !isSearching &&
          predictions.length === 0 &&
          query.trim().length >= 2 &&
          !searchError && (
            <p className="text-xs text-zinc-500">
              No results. Try a different name or enable manual entry below.
            </p>
          )}

        {searchError && (
          <p className="text-xs text-red-400">Search error: {searchError}</p>
        )}
      </div>

      {/* ?? Google Map ?? */}
      {center && (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          {MAPS_KEY ? (
            <APIProvider apiKey={MAPS_KEY}>
              <Map
                style={{ width: "100%", height: 260 }}
                defaultCenter={center}
                center={center}
                defaultZoom={16}
                zoom={16}
                gestureHandling="cooperative"
                disableDefaultUI={false}
                colorScheme="DARK"
              >
                <Marker
                  position={center}
                  draggable
                  onDragEnd={(e) => {
                    if (e.latLng) {
                      onChange({
                        latitude: e.latLng.lat(),
                        longitude: e.latLng.lng(),
                        google_place_id: null,
                      });
                    }
                  }}
                />
              </Map>
            </APIProvider>
          ) : (
            // Fallback if NEXT_PUBLIC_GOOGLE_MAPS_KEY is not yet set in Vercel
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 bg-zinc-800 text-zinc-400">
              <MapPin className="h-6 w-6 text-red-400" />
              <p className="text-sm font-medium text-white">
                {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
              </p>
              <p className="text-xs">
                Add <code className="rounded bg-zinc-700 px-1">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> to Vercel to see the map
              </p>
            </div>
          )}
        </div>
      )}

      {/* ?? Address / City (editable after autocomplete) ?? */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-zinc-300">Address *</Label>
          <Input
            value={value.address}
            onChange={(e) => onChange({ address: e.target.value })}
            required
            placeholder="Street, building, landmark"
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">City *</Label>
          <Input
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
            required
            className="bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
      </div>

      {/* ?? Manual coords fallback ?? */}
      <div>
        <Button
          type="button"
          variant="link"
          onClick={() => setManualOverride((v) => !v)}
          className="h-auto p-0 text-xs text-zinc-400 hover:text-zinc-200"
        >
          {manualOverride
            ? "Hide manual coordinates"
            : "Business not on Google? Enter coordinates manually"}
        </Button>
      </div>

      {manualOverride && (
        <div className="grid gap-3 sm:grid-cols-2 rounded-lg border border-dashed border-zinc-800 p-3">
          <div className="space-y-2">
            <Label className="text-zinc-300 text-xs">Latitude</Label>
            <Input
              type="number"
              step="0.000001"
              value={value.latitude}
              onChange={(e) =>
                onChange({
                  latitude: parseFloat(e.target.value || "0"),
                  google_place_id: null,
                })
              }
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300 text-xs">Longitude</Label>
            <Input
              type="number"
              step="0.000001"
              value={value.longitude}
              onChange={(e) =>
                onChange({
                  longitude: parseFloat(e.target.value || "0"),
                  google_place_id: null,
                })
              }
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
          <p className="sm:col-span-2 text-xs text-zinc-500">
            Tip: right-click your business on Google Maps -- coordinates appear at the top of the menu.
          </p>
        </div>
      )}
    </div>
  );
}
