"use client";

import { useEffect, useState } from "react";
import { getPlaces } from "@/lib/actions/challenges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

type Place = {
  id: string;
  name: string;
  city: string | null;
  category: string | null;
};

export default function ManagePlacesPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getPlaces().then((data) => {
      setPlaces(data as Place[]);
      setLoaded(true);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Places</h1>
        <p className="text-zinc-400 mt-1">
          All active locations available for challenges.
        </p>
      </div>

      {loaded && places.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">No places yet</h3>
            <p className="text-zinc-400 mt-1">
              Places will appear here once they are added.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {places.map((place) => (
            <Card
              key={place.id}
              className="bg-zinc-900 border-zinc-800"
            >
              <CardHeader>
                <CardTitle className="text-white">{place.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {place.category && (
                    <Badge className="bg-blue-600/20 text-blue-400">
                      {place.category}
                    </Badge>
                  )}
                  {place.city && (
                    <Badge className="bg-zinc-700 text-zinc-300">
                      {place.city}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
