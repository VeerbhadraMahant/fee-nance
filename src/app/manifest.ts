import type { MetadataRoute } from "next";

/**
 * Lets phones add Fee-Nance to the home screen and open it without browser
 * chrome. The app still needs a connection; there is no offline mode.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fee-Nance",
    short_name: "Fee-Nance",
    description: "Personal and group finance in one ledger.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#e2e2df",
    theme_color: "#e2e2df",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
