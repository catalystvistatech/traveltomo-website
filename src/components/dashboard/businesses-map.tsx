"use client";

import { useEffect, useMemo } from "react";
import { APIProvider, InfoWindow, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";
import type { OverviewBusiness } from "@/lib/actions/overview";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
// Centre of the Philippines, for when no business has a pin yet.
const PH_CENTER = { lat: 12.8797, lng: 121.774 };

type Pinned = OverviewBusiness & { latitude: number; longitude: number };

interface Props {
  businesses: OverviewBusiness[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** Every business as a pin; click one for its details. */
export function BusinessesMap({ businesses, selectedId, onSelect }: Props) {
  // Memoised so selecting a pin doesn't re-fit the map to every pin.
  const pinned = useMemo(
    () => businesses.filter((b): b is Pinned => b.latitude != null && b.longitude != null),
    [businesses]
  );
  const selected = pinned.find((b) => b.id === selectedId) ?? null;

  if (!MAPS_KEY) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400">
        <MapPin className="h-6 w-6 text-red-400" />
        <p className="text-sm">Set NEXT_PUBLIC_GOOGLE_MAPS_KEY to show the map.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <APIProvider apiKey={MAPS_KEY}>
        <Map
          style={{ width: "100%", height: 420 }}
          defaultCenter={PH_CENTER}
          defaultZoom={6}
          gestureHandling="greedy"
          colorScheme="DARK"
          onClick={() => onSelect(null)}
        >
          <FitToPins pins={pinned} />
          <PanToSelected selected={selected} />
          {pinned.map((b) => (
            <Marker
              key={b.id}
              position={{ lat: b.latitude, lng: b.longitude }}
              title={b.name}
              onClick={() => onSelect(b.id)}
            />
          ))}
          {selected && (
            <InfoWindow
              position={{ lat: selected.latitude, lng: selected.longitude }}
              pixelOffset={[0, -36]}
              onCloseClick={() => onSelect(null)}
            >
              <div className="space-y-0.5 text-zinc-900">
                <p className="font-semibold">{selected.name}</p>
                {selected.address && <p className="text-xs">{selected.address}</p>}
                <p className="text-xs">
                  {selected.merchant_name ?? "Unknown merchant"}
                  {selected.merchant_email ? ` · ${selected.merchant_email}` : ""}
                </p>
                <p className="text-xs">
                  {selected.verification_status} · {selected.live_quests} live{" "}
                  {selected.live_quests === 1 ? "quest" : "quests"}
                </p>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}

/** Zooms to fit every pin once they load. */
function FitToPins({ pins }: { pins: Pinned[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || pins.length === 0) return;
    if (pins.length === 1) {
      map.setCenter({ lat: pins[0].latitude, lng: pins[0].longitude });
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of pins) bounds.extend({ lat: p.latitude, lng: p.longitude });
    map.fitBounds(bounds, 48);
  }, [map, pins]);
  return null;
}

/** Brings a business picked from the list into view. */
function PanToSelected({ selected }: { selected: Pinned | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !selected) return;
    map.panTo({ lat: selected.latitude, lng: selected.longitude });
  }, [map, selected]);
  return null;
}
