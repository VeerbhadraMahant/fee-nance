"use client";

import { useEffect } from "react";

import { logger } from "@/lib/logger";

/**
 * Replaces the root layout entirely when it fails, so the app's stylesheet is
 * not guaranteed to be loaded here. Everything below is inline-styled, with a
 * `prefers-color-scheme` block so it stays readable in both themes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Global app error boundary triggered", error, {
      digest: error.digest,
      source: "src/app/global-error.tsx",
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#e2e2df",
          color: "#070607",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          lineHeight: 1.6,
        }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #070607 !important; color: #f7f6f2 !important; }
            .ge-card { background: #17151a !important; border-color: #322e30 !important; }
            .ge-muted { color: #b7b4ae !important; }
            .ge-btn { background: #fc5000 !important; color: #070607 !important; }
          }
          .ge-btn:focus-visible { outline: 2px solid #fc5000; outline-offset: 2px; }
        `}</style>

        <main
          className="ge-card"
          style={{
            width: "100%",
            maxWidth: "28rem",
            padding: "2.5rem",
            textAlign: "center",
            background: "#f7f6f2",
            border: "1.5px solid #070607",
            borderRadius: "2.5rem",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 600 }}>
            Fee-Nance couldn&rsquo;t load
          </h1>
          <p
            className="ge-muted"
            style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#8a8783" }}
          >
            A critical rendering error stopped the app from starting. Retrying
            usually clears it.
          </p>

          {error.digest && (
            <p
              className="ge-muted"
              style={{
                marginTop: "0.75rem",
                fontSize: "0.75rem",
                fontFamily: "ui-monospace, monospace",
                color: "#8a8783",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            className="ge-btn"
            style={{
              marginTop: "1.5rem",
              minHeight: "2.75rem",
              padding: "0 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#070607",
              background: "#fc5000",
              border: "none",
              borderRadius: "9999px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
