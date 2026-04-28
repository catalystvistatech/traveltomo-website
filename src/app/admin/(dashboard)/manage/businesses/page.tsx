"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listBusinessVerificationQueue,
  reviewBusiness,
} from "@/lib/actions/business";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";

type Row = Awaited<ReturnType<typeof listBusinessVerificationQueue>>[number];

export default function BusinessesQueuePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  async function reload() {
    setIsLoading(true);
    setRows(await listBusinessVerificationQueue());
    setIsLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  function handleDecision(
    id: string,
    decision: "approved" | "rejected" | "suspended"
  ) {
    startTransition(async () => {
      const r = await reviewBusiness(id, decision);
      if ("error" in r) toast.error(r.error as string);
      else {
        toast.success(`Marked ${decision}`);
        await reload();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Business Verification</h1>
        <p className="text-zinc-400 mt-1">
          Approve merchants so their challenges can go live.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-zinc-500 text-sm">
          No pending businesses. Inbox zero!
        </p>
      )}

      <div className="grid gap-4">
        {rows.map((b) => {
          const rec = b as Record<string, unknown>;
          const profile = rec.profiles as { display_name: string | null } | null;
          return (
            <Card
              key={rec.id as string}
              className="bg-zinc-900 border-zinc-800"
            >
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  {rec.name as string}
                  <Badge
                    variant="outline"
                    className="border-yellow-600 text-yellow-400 uppercase text-[10px]"
                  >
                    {rec.verification_status as string}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Merchant: {profile?.display_name ?? "(no name)"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-300">
                <div>
                  <span className="text-zinc-500">Address: </span>
                  {rec.address as string}, {rec.city as string}
                </div>
                <div className="flex gap-6 text-xs text-zinc-500">
                  <span>
                    Type:{" "}
                    <span className="text-zinc-300">
                      {(rec.establishment_type as string) ?? "other"}
                    </span>
                  </span>
                  <span>
                    Lat:{" "}
                    <span className="text-zinc-300">
                      {rec.latitude as number}
                    </span>
                  </span>
                  <span>
                    Lng:{" "}
                    <span className="text-zinc-300">
                      {rec.longitude as number}
                    </span>
                  </span>
                  <span>
                    Radius:{" "}
                    <span className="text-zinc-300">
                      {rec.service_radius_meters as number}m
                    </span>
                  </span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      handleDecision(rec.id as string, "approved")
                    }
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    disabled={pending}
                    variant="outline"
                    onClick={() =>
                      handleDecision(rec.id as string, "rejected")
                    }
                    className="border-red-700 text-red-400"
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={pending}
                    variant="ghost"
                    onClick={() =>
                      handleDecision(rec.id as string, "suspended")
                    }
                    className="text-zinc-400"
                  >
                    Suspend
                  </Button>
                  <a
                    className="ml-auto text-xs text-blue-400 hover:underline self-center"
                    href={`https://www.google.com/maps/search/?api=1&query=${rec.latitude},${rec.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Google Maps ?
                  </a>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
