import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic page-level loading skeleton used by both:
 *  - Next.js loading.tsx (server component pages)
 *  - "use client" pages during their initial data fetch
 *
 * variant="cards"  – stat-card grid (dashboard home, analytics)
 * variant="list"   – stacked card list (most CRUD pages)
 * variant="form"   – single centred content block (business profile, promote)
 */
export function PageSkeleton({
  variant = "list",
}: {
  variant?: "cards" | "list" | "form";
}) {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-56 bg-zinc-800" />
        <Skeleton className="h-4 w-80 bg-zinc-800/60" />
      </div>

      {variant === "cards" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24 bg-zinc-800" />
                  <Skeleton className="h-4 w-4 rounded bg-zinc-800" />
                </div>
                <Skeleton className="h-8 w-16 bg-zinc-800" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <Skeleton className="h-5 w-36 bg-zinc-800" />
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg bg-zinc-800" />
              ))}
            </div>
          </div>
        </>
      )}

      {variant === "list" && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-40 bg-zinc-800" />
                    <Skeleton className="h-5 w-16 rounded-full bg-zinc-800" />
                  </div>
                  <Skeleton className="h-3 w-64 bg-zinc-800/60" />
                  <Skeleton className="h-3 w-32 bg-zinc-800/40" />
                </div>
                <Skeleton className="h-8 w-20 rounded-md bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {variant === "form" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-5">
          <Skeleton className="h-5 w-32 bg-zinc-800" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20 bg-zinc-800" />
                <Skeleton className="h-10 rounded-lg bg-zinc-800" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-28 rounded-md bg-zinc-800 mt-2" />
        </div>
      )}
    </div>
  );
}
