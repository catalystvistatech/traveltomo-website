"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Search } from "lucide-react";

/**
 * Single prediction returned by `/v1/places/autocomplete`.
 * Mirrors what the route serialises so the types match end-to-end.
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
  /**
   * Called with any subset of fields that should be patched on the
   * parent form. `name` is only emitted when the merchant selects a
   * place and the parent's current name field is empty.
   */
  onChange: (patch: Partial<BusinessLocationValue>) => void;
  /**
   * Optional: bias autocomplete toward the merchant's current
   * coordinate. Defaults to the value.latitude/longitude if present.
   */
  biasLat?: number | null;
  biasLng?: number | null;
}

/**
 * Merchant-facing location picker. Replaces the raw address/city/lat/lng
 * inputs with:
 *   - A debounced Google Places autocomplete dropdown
 *   - A static-map preview of the currently-pinned coordinate
 *   - A manual override toggle for edge cases (businesses not on Google)
 *
 * The API key never touches the client; all Google calls are proxied
 * through `/v1/places/autocomplete` and `/v1/places/static-map`.
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

  // Debounce the autocomplete query so we hit Google at most every
  // 300ms and never for single-character inputs. Each in-flight
  // request is tagged so late responses from a stale query are
  // discarded (classic race condition guard).
  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++latestQueryRef.current;

    if (trimmed.length < 2) {
      // Deferred so React doesn't flag this as a cascading-render
      // setState-in-effect violation. Effect-order semantics are
      // preserved because `requestId` already invalidated any
      // in-flight search above.
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
          error instanceof Error ? error.message : "Search failed",
        );
        setPredictions([]);
      } finally {
        if (requestId === latestQueryRef.current) setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, biasLatitude, biasLongitude]);

  // Dismiss the dropdown when clicking outside the picker entirely, so
  // the list doesn't hover forever after selection or cancel.
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
      // Only seed the name field when the parent form is empty so we
      // don't clobber a merchant's custom branding.
      if (!value.name || value.name.trim().length === 0) {
        patch.name = prediction.name;
      }
      onChange(patch);
      setQuery("");
      setShowResults(false);
      setPredictions([]);
      setManualOverride(false);
    },
    [onChange, value.city, value.name],
  );

  // Only show the map preview once the merchant has actually selected a
  // suggestion (google_place_id is set) or manually entered an address.
  // The form default lat/lng (15.143, 120.586) should not trigger a map.
  const hasCoordinates =
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    !(value.latitude === 0 && value.longitude === 0) &&
    !!(value.google_place_id || value.address?.trim());

  // OpenStreetMap embed ù no API key required, interactive out of the
  // box, and tolerates the same same-origin CSP the dashboard uses.
  const osmSrc = hasCoordinates
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${value.longitude - 0.008},${value.latitude - 0.005},${value.longitude + 0.008},${value.latitude + 0.005}&layer=mapnik&marker=${value.latitude},${value.longitude}`
    : null;

  return (
    <div className="space-y-3" ref={containerRef}>
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

        {showResults && predictions.length > 0 && (
          <div
            role="listbox"
            className="rounded-lg border border-zinc-800 bg-zinc-900 shadow-lg overflow-hidden"
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
              No matches on Google Maps. Try a different name or use
              manual entry below.
            </p>
          )}

        {searchError && (
          <p className="text-xs text-red-400">
            Couldn&apos;t reach Google Maps: {searchError}
          </p>
        )}
      </div>

      {osmSrc && (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <iframe
            src={osmSrc}
            title={`Map ù ${value.address || "selected location"}`}
            width="640"
            height="240"
            className="w-full"
            style={{ height: 240, border: 0, display: "block" }}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <p className="px-3 py-1.5 text-xs text-zinc-500">
            ù <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 underline underline-offset-2">OpenStreetMap</a> contributors
          </p>
        </div>
      )}

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
            Tip: open Google Maps, right-click on your business, and the
            coordinates will be at the top of the menu. Clearing these
            unlinks any previously-matched Google place.
          </p>
        </div>
      )}
    </div>
  );
}
