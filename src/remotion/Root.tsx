import * as React from "react";
import { Composition } from "remotion";
import { loadFont as loadBebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadDmSans } from "@remotion/google-fonts/DMSans";

import { FeeNanceVideo } from "./FeeNanceVideo";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./tokens";

/**
 * Entry for Remotion Studio and `remotion render`. Inside the app the fonts
 * come from the page itself; here they are loaded explicitly.
 */
loadBebas();
loadDmSans("normal", { weights: ["500", "700"] });

export function RemotionRoot() {
  return (
    <Composition
      id="FeeNanceVideo"
      component={FeeNanceVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}
