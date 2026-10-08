"use client";

import { useEffect, useRef } from "react";

/**
 * Lets another page (the command palette, a dashboard shortcut) deep-link
 * straight into a create dialog with `?new=<intent>`. The parameter is
 * consumed once and stripped from the URL, so a refresh or back-navigation
 * doesn't reopen the dialog.
 */
export function useCreateIntent(intent: string, open: () => void) {
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") !== intent) return;
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url);
    // Deferred a frame so the dialog opens after hydration has settled.
    const frame = requestAnimationFrame(() => openRef.current());
    return () => cancelAnimationFrame(frame);
  }, [intent]);
}
