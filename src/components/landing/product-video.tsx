"use client";

import * as React from "react";
import dynamic from "next/dynamic";

const Player = dynamic(() => import("./product-video-player"), {
  ssr: false,
  loading: () => <Placeholder />,
});

function Placeholder() {
  return (
    <div className="flex aspect-video w-full items-center justify-center bg-foreground text-background">
      <span className="font-display text-2xl sm:text-4xl">Fee-Nance</span>
    </div>
  );
}

/**
 * "See it in 35 seconds". The player code is fetched only once this section is
 * about to scroll into view, so it never slows the first paint.
 */
export function ProductVideo() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [near, setNear] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-3xl border border-foreground bg-foreground"
      role="region"
      aria-label="Fee-Nance product video, about 35 seconds, no sound"
    >
      {near ? <Player /> : <Placeholder />}
    </div>
  );
}
