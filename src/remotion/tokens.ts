/**
 * Look of the product video. Colours are the app's own Caldera tokens
 * (src/app/globals.css) so the film reads as the same product, and the fonts
 * are the app's Bebas display and DM Sans body (CSS variables set in the root
 * layout, falling back to the Google Fonts names for Remotion Studio renders).
 */

export const C = {
  pumice: "#e2e2df",
  limestone: "#f7f6f2",
  obsidian: "#070607",
  ember: "#fc5000",
  violet: "#524ae9",
  sulfur: "#f5f28e",
  muted: "#ececea",
  ink2: "#4a4846",
  hair: "#d3d2ce",
  good: "#067a5e",
  goodBg: "#dcf3ea",
  warn: "#b54708",
  warnBg: "#f5e8d8",
  bad: "#b42318",
  badBg: "#fbe2df",
  info: "#175cd3",
  infoBg: "#dbe7f8",
  night: "#17151a",
  nightLine: "#322e30",
} as const;

export const FONT_DISPLAY = `var(--font-display, "Bebas Neue"), "Bebas Neue", Impact, "Arial Narrow", sans-serif`;
export const FONT_BODY = `var(--font-body, "DM Sans"), "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

/** How long each scene holds, in frames. Pacing is deliberately unhurried. */
export const SCENE_FRAMES = {
  hook: 135,
  log: 150,
  budgets: 150,
  groups: 180,
  insights: 135,
  offline: 150,
  end: 120,
} as const;

/** Each scene fades in over the end of the previous one. */
export const OVERLAP = 8;

export const TOTAL_FRAMES = Object.values(SCENE_FRAMES).reduce((a, b) => a + b, 0);

/** A frame that reads well as a still, for the poster and reduced-motion viewers. */
export const POSTER_FRAME = SCENE_FRAMES.hook + SCENE_FRAMES.log + 110;
