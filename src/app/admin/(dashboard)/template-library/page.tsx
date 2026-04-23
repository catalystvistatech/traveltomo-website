"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listPublishedTemplates } from "@/lib/actions/templates";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ESTABLISHMENT_LABELS,
  type EstablishmentType,
} from "@/lib/validations/marketplace";

type Template = Awaited<ReturnType<typeof listPublishedTemplates>>[number];

export default function TemplateLibraryPage() {
  const [list, setList] = useState<Template[]>([]);

  useEffect(() => {
    listPublishedTemplates().then(setList);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Template Library</h1>
        <p className="text-zinc-400 mt-1">
          Challenge ideas authored by TravelTomo admins. Open a Travel Challenge
          and click &ldquo;Clone from Template&rdquo; to pull one into your
          set.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.length === 0 && (
          <p className="text-zinc-500 text-sm">
            No templates available yet � your admins will publish some soon.
          </p>
        )}
        {list.map((t) => {
          const r = t as Record<string, unknown>;
          return (
            <Card
              key={r.id as string}
              className="bg-zinc-900 border-zinc-800"
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-white text-base">
                    {r.title as string}
                  </CardTitle>
                  {r.establishment_type ? (
                    <Badge className="bg-zinc-800 text-zinc-200">
                      {ESTABLISHMENT_LABELS[r.establishment_type as EstablishmentType] ?? String(r.establishment_type)}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-zinc-400 line-clamp-3">
                  {r.description as string}
                </p>
                <p className="text-xs text-zinc-500">
                  XP {r.suggested_xp as number} � Radius{" "}
                  {r.suggested_radius_meters as number}m �{" "}
                  {(r.verification_type as string) ?? "gps"}
                </p>
                <Link
                  href="/admin/travel-challenges"
                  className="text-xs text-blue-400 hover:underline"
                >
                  Go to Travel Challenges ?
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
