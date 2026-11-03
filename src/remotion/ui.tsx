import * as React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

import { C, FONT_BODY, FONT_DISPLAY } from "./tokens";

/** A long, soft landing. Motion here reads as heavy and deliberate, not snappy. */
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

/** 0 to 1 over `duration` frames starting at `start`, eased. Clamped. */
export function appear(frame: number, start: number, duration = 22) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
}

/** Counts a number from `from` to `to` between two frames. */
export function count(frame: number, start: number, end: number, from: number, to: number) {
  return Math.round(
    interpolate(frame, [start, end], [from, to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    }),
  );
}

export const rupees = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN")}`;

/** Fades and lifts its children in. `frame` is the scene's own clock. */
export function Rise({
  frame,
  at,
  duration = 24,
  distance = 28,
  style,
  children,
}: {
  frame: number;
  at: number;
  duration?: number;
  distance?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const t = appear(frame, at, duration);
  return (
    <div style={{ opacity: t, transform: `translateY(${(1 - t) * distance}px)`, ...style }}>{children}</div>
  );
}

/**
 * Wraps a scene: a full-frame background that fades in over the previous scene
 * during the first `lead` frames, and gives children a clock that starts after.
 */
export function Scene({
  lead,
  background,
  children,
}: {
  lead: number;
  background: string;
  children: (frame: number) => React.ReactNode;
}) {
  const raw = useCurrentFrame();
  const opacity = lead > 0 ? interpolate(raw, [0, lead], [0, 1], { extrapolateRight: "clamp" }) : 1;
  return (
    <div style={{ position: "absolute", inset: 0, background, opacity, overflow: "hidden", fontFamily: FONT_BODY }}>
      {children(raw - lead)}
    </div>
  );
}

export function BrandMark({ size = 44, ink = C.obsidian, bg = C.ember }: { size?: number; ink?: string; bg?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: ink,
        display: "grid",
        placeItems: "center",
        fontFamily: FONT_DISPLAY,
        fontSize: size * 0.62,
        lineHeight: 1,
        paddingTop: size * 0.05,
        flex: "none",
      }}
    >
      F
    </div>
  );
}

export function Display({
  size,
  color = C.obsidian,
  children,
  style,
}: {
  size: number;
  color?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: size,
        lineHeight: 0.95,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  bg,
  color,
  size = 20,
}: {
  children: React.ReactNode;
  bg: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: bg,
        color,
        borderRadius: 800,
        padding: `${size * 0.22}px ${size * 0.7}px`,
        fontSize: size,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** A limestone window, the way cards look in the app. */
export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: C.limestone,
        border: `1px solid ${C.hair}`,
        borderRadius: 32,
        padding: 28,
        color: C.obsidian,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Caption({
  children,
  color = C.ink2,
  size = 26,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  return <div style={{ fontSize: size, lineHeight: 1.4, color, fontWeight: 500, ...style }}>{children}</div>;
}
