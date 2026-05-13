"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

/**
 * Dashboard-wide error boundary. Replaces the generic Next.js
 * "An error occurred in the Server Components render" production
 * message with an actionable UI that gives the user a way to retry
 * and shows the digest so we can correlate Vercel logs.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console so devs can see something even in
    // production - the digest stays attached to the underlying logs.
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800">
        <CardContent className="space-y-4 py-10 text-center">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/15">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">
              Something went wrong on this page
            </h2>
            <p className="text-sm text-zinc-400">
              We hit an unexpected error while loading. Try again - if it
              keeps happening, send us the reference below.
            </p>
          </div>
          {error.digest && (
            <p className="font-mono text-xs text-zinc-500">
              ref: {error.digest}
            </p>
          )}
          <div className="flex justify-center gap-2 pt-2">
            <Button
              onClick={reset}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Try again
            </Button>
            <Button
              variant="outline"
              onClick={() => (window.location.href = "/admin")}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Back to dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
