"use client";

import * as React from "react";
import { AlertCircle, CloudOff, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { discardItem, retryItem, syncNow, useOfflineState } from "@/lib/offline/client";
import { formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The one place offline mode shows itself. Invisible while you're online with
 * nothing waiting; otherwise a small pill above the bottom nav that opens the
 * list of changes that haven't reached the server yet, with a way to discard
 * or retry each. Nothing here is a surprise: a change is either synced, or
 * listed here with the reason it isn't.
 */
export function OfflineStatus() {
  const { online, syncing, authRequired, items } = useOfflineState();
  const [open, setOpen] = React.useState(false);

  const pending = items.filter((item) => item.status === "pending");
  const failed = items.filter((item) => item.status === "failed");
  const visible = !online || syncing || authRequired || items.length > 0;
  if (!visible) return null;

  const summary = !online
    ? pending.length
      ? `Offline · ${pending.length} waiting to sync`
      : "Offline"
    : syncing
      ? "Syncing…"
      : authRequired
        ? "Sign in to sync changes"
        : failed.length
          ? `${failed.length} change${failed.length === 1 ? "" : "s"} need review`
          : `${pending.length} waiting to sync`;

  const tone = failed.length || authRequired ? "warning" : !online ? "muted" : "primary";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-live="polite"
        className={cn(
          // Above the mobile bottom nav and the home indicator; bottom-right on desktop.
          "fixed left-1/2 z-40 flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border px-4 text-sm font-medium shadow-sm outline-none",
          "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden",
          tone === "warning" && "border-warning bg-warning-subtle text-foreground",
          tone === "muted" && "border-foreground/30 bg-card text-foreground",
          tone === "primary" && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {syncing ? (
          <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
        ) : failed.length || authRequired ? (
          <AlertCircle className="size-4" aria-hidden="true" />
        ) : (
          <CloudOff className="size-4" aria-hidden="true" />
        )}
        {summary}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{online ? "Sync" : "You're offline"}</DialogTitle>
            <DialogDescription>
              {online
                ? "Changes made without a connection are kept on this device and sent in order."
                : "Pages you've opened before still work. Adding, editing or deleting transactions, adding group expenses and recording payments are saved here and sync when you're back online. Everything else needs a connection."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4 py-4">
            {authRequired && (
              <p role="alert" className="rounded-3xl bg-warning-subtle px-4 py-3 text-sm">
                Your session expired while changes were waiting. Sign in again and they&rsquo;ll sync.
              </p>
            )}

            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is waiting. Everything is saved to your account.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-foreground/15">
                {items.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatRelative(item.createdAt)}
                        {item.status === "failed" && item.error ? ` · ${item.error}` : ""}
                      </p>
                    </div>
                    <Badge variant={item.status === "failed" ? "destructive" : "outline"}>
                      {item.status === "failed" ? "Couldn’t save" : "Waiting"}
                    </Badge>
                    <div className="flex gap-1.5">
                      {item.status === "failed" && (
                        <Button size="sm" variant="outline" onClick={() => void retryItem(item.id)} disabled={!online}>
                          Retry
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void discardItem(item.id)}>
                        Discard
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              loading={syncing}
              disabled={!online || pending.length === 0}
              onClick={() => void syncNow()}
            >
              Sync now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
