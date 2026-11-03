"use client";

import * as React from "react";

/**
 * Chrome and Edge (desktop and Android) offer to install a site as an app, and
 * fire `beforeinstallprompt` when they will. The event arrives once and early,
 * so it is caught here at module load and kept until someone asks to install.
 * Safari has no such event: on iPhone and iPad it is Share → Add to Home Screen.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** `canInstall` is true only while the browser is willing to show its install dialog. */
export function useInstallPrompt() {
  const canInstall = React.useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false,
  );

  const install = React.useCallback(async () => {
    if (!deferred) return;
    const event = deferred;
    deferred = null;
    notify();
    await event.prompt();
    await event.userChoice.catch(() => undefined);
  }, []);

  return { canInstall, install };
}
