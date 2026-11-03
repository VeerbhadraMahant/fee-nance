"use client";

import * as React from "react";
import { Player } from "@remotion/player";

import { FeeNanceVideo } from "@/remotion/FeeNanceVideo";
import { FPS, HEIGHT, POSTER_FRAME, TOTAL_FRAMES, WIDTH } from "@/remotion/tokens";

const noSubscribe = () => () => {};

/**
 * The product film, played live in the page by Remotion's player: no video
 * file to host, sharp at any size. Loaded only when the section nears the
 * viewport (see product-video.tsx), because it is the heaviest code on the page.
 */
export default function ProductVideoPlayer() {
  // Someone who asked for less motion gets a still frame and a play button.
  const reducedMotion = React.useSyncExternalStore(
    noSubscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  return (
    <Player
      component={FeeNanceVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      controls
      loop
      autoPlay={!reducedMotion}
      initialFrame={reducedMotion ? POSTER_FRAME : 0}
      initiallyMuted
      clickToPlay
      spaceKeyToPlayOrPause={false}
      acknowledgeRemotionLicense
      style={{ width: "100%", aspectRatio: `${WIDTH} / ${HEIGHT}`, borderRadius: "inherit" }}
    />
  );
}
