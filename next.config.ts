import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    // The public product tour is a standalone page in /public.
    return [{ source: "/tour", destination: "/tour.html" }];
  },
  async headers() {
    return [
      {
        // The worker must always be re-fetched, or a fixed bug would keep
        // running from browsers' HTTP cache. Scope is the whole origin.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
