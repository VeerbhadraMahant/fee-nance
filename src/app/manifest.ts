import type { MetadataRoute } from "next";

/**
 * Lets phones install Fee-Nance and open it without browser chrome. Together
 * with the service worker in public/sw.js it also opens with no connection;
 * see docs/offline.md for what works offline and what doesn't.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Fee-Nance",
    short_name: "Fee-Nance",
    description: "Personal and group finance in one ledger. Works offline.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#e2e2df",
    theme_color: "#e2e2df",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    // Long-press the home-screen icon. These use the create-intent links the
    // command palette already understands.
    shortcuts: [
      { name: "Add expense", short_name: "Expense", url: "/finance?new=transaction", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Groups", url: "/groups", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Ask the copilot", short_name: "Copilot", url: "/copilot", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
