"use client";

import { useEffect, useState } from "react";
import { getPlaces } from "@/lib/actions/challenges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

type Place = { id: string; name: string; city: string | null; category: string | null };

export default function AdminPlacesPage() {
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    getPlaces().then(setPlaces);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Places</h1>
        <p className="text-zinc-400 mt-1">
          Points of interest available for challenges.
        </p>
      </div>

      {places.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-12 text-center">
            <MapPin className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">
              No places yet. Run the SQL seed or add via Google Places sync.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {places.map((p) => (
            <Card key={p.id} className="bg-zinc-900 border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-white text-base">{p.name}</CardTitle>
                <div className="flex gap-2">
                  {p.category && (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                      {p.category}
                    </Badge>
                  )}
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                    {p.city}
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
