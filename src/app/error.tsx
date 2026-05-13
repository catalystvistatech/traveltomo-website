"use client";

import { useEffect } from "react";

/**
 * Root-level error boundary for any route that doesn't have its own
 * `error.tsx`. Catches errors from `app/page.tsx`, the marketing
 * landing, auth pages (`/admin/login`, `/admin/register`,
 * `/admin/auth/callback`), and anything else outside the
 * `(dashboard)` segment.
 *
 * Without this, Next.js falls back to its built-in
 * "An error occurred in the Server Components render..." message
 * which hides the actual reason in production. We still hide the
 * underlying message (Next.js strips it before reaching here) but at
 * least we show the digest so it can be correlated with Vercel logs.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-white">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600/15">
        <span aria-hidden className="text-2xl">!</span>
      </div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-zinc-400">
        The page hit an unexpected error. Try again &mdash; if it keeps
        happening, send us the reference below so we can correlate it
        with our logs.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-zinc-500">ref: {error.digest}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Back home
        </a>
      </div>
    </div>
  );
}
