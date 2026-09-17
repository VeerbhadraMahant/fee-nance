"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

/**
 * Toasts are polite live regions — they never steal focus, and they sit
 * above the mobile bottom nav so they don't cover it.
 */
function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark") ?? "system"}
      position="bottom-right"
      duration={4000}
      closeButton
      offset={16}
      mobileOffset={{ bottom: 88, left: 16, right: 16 }}
      toastOptions={{
        classNames: {
          toast:
            "group rounded-3xl border-[1.5px] border-foreground bg-popover text-popover-foreground",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground rounded-full",
          cancelButton: "bg-muted text-muted-foreground rounded-full",
          error: "border-destructive/60",
          success: "border-success/60",
        },
      }}
    />
  );
}

export { Toaster };
export { toast } from "sonner";
