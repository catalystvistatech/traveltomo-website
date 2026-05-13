"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown by the **root** `app/layout.tsx` (or any code
 * it imports before the page renders). This is the last line of
 * defence — it replaces the entire document, so it must render its
 * own `<html>` / `<body>` per Next.js requirements.
 *
 * Errors thrown by nested layouts (e.g. `(dashboard)/layout.tsx`) and
 * by individual pages are caught higher up the tree by their own
 * `error.tsx` files. Only true root-layout failures get here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          color: "#fafafa",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 9999,
              background: "rgba(220, 38, 38, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 24,
            }}
            aria-hidden
          >
            !
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 16 }}>
            The app hit an unexpected error. Try again — if it keeps
            happening, send us the reference below.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: 12,
                color: "#71717a",
                marginBottom: 20,
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              background: "#dc2626",
              color: "white",
              fontWeight: 500,
              fontSize: 14,
              border: 0,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
