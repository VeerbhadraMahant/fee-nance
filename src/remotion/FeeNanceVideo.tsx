import * as React from "react";
import { AbsoluteFill, Sequence } from "remotion";

import { BudgetsScene, EndScene, GroupsScene, HookScene, InsightsScene, LogScene, OfflineScene } from "./scenes";
import { OVERLAP, SCENE_FRAMES } from "./tokens";

/**
 * The product film: seven scenes back to back, each fading in over the end of
 * the one before. Every scene runs its own clock from the moment it is fully
 * visible, so timing inside a scene never depends on where it sits in the film.
 */

const ORDER = [
  ["hook", HookScene],
  ["log", LogScene],
  ["budgets", BudgetsScene],
  ["groups", GroupsScene],
  ["insights", InsightsScene],
  ["offline", OfflineScene],
  ["end", EndScene],
] as const;

const TIMELINE = (() => {
  let start = 0;
  return ORDER.map(([key, Scene], index) => {
    const lead = index === 0 ? 0 : OVERLAP;
    const entry = { key, Scene, lead, from: start - lead, duration: SCENE_FRAMES[key] + lead };
    start += SCENE_FRAMES[key];
    return entry;
  });
})();

export function FeeNanceVideo() {
  return (
    <AbsoluteFill style={{ background: "#070607" }}>
      {TIMELINE.map(({ key, Scene, lead, from, duration }) => (
        <Sequence key={key} from={from} durationInFrames={duration}>
          <Scene lead={lead} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
