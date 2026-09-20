"use client";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Check, Copy, LogOut, Plus, Trash2, UserPlus, Users } from "lucide-react";

import { readApiError, useQuery } from "@/lib/use-query";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";

interface GroupMember {
  userId: { _id: string; name: string; email: string };
  role: "owner" | "member";
}

interface Group {
  _id: string;
  name: string;
  inviteCode: string;
  members: GroupMember[];
}

/* ── Invite code with copy affordance ──────────────────────────────────── */

function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Invite code copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the code and copy it manually.");
    }
  };

  return (
    <Tooltip content={copied ? "Copied" : "Copy invite code"}>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 font-mono text-xs tracking-wider transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {code}
        {copied ? (
          <Check className="size-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="sr-only">
          {copied ? "Copied to clipboard" : "Copy invite code"}
        </span>
      </button>
    </Tooltip>
  );
}

/* ── Member avatar stack ───────────────────────────────────────────────── */

function MemberStack({ members }: { members: GroupMember[] }) {
  const shown = members.slice(0, 4);
  const overflow = members.length - shown.length;
  const names = members.map((m) => m.userId.name).join(", ");

  return (
    <div className="flex items-center gap-2">
      <ul className="flex -space-x-2" aria-label={`Members: ${names}`}>
        {shown.map((member) => (
          <li key={member.userId._id}>
            <Tooltip content={`${member.userId.name}${member.role === "owner" ? " (owner)" : ""}`}>
              <span className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-2xs font-semibold text-secondary-foreground">
                {initials(member.userId.name)}
              </span>
            </Tooltip>
          </li>
        ))}
        {overflow > 0 && (
          <li>
            <span className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-muted text-2xs font-semibold text-muted-foreground">
              +{overflow}
            </span>
          </li>
        )}
      </ul>
      <span className="text-xs text-muted-foreground">
        {members.length} member{members.length === 1 ? "" : "s"}
      </span>
    </div>
  );
}

/* ── Create / join dialogs ─────────────────────────────────────────────── */

function CreateGroupDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setError("");
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the group a name your friends will recognise.");
      document.getElementById("group-name")?.focus();
      return;
    }

    setSaving(true);
    const response = await fetch("/api/private/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setSaving(false);

    if (!response.ok) {
      setError(await readApiError(response, "Couldn't create the group"));
      return;
    }

    toast.success(`"${name.trim()}" created — share the invite code to add people`);
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Groups let you log shared expenses and settle balances together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="py-4">
            <Field
              label="Group name"
              htmlFor="group-name"
              required
              error={error || undefined}
              hint="You'll get an invite code to share once it's created."
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Goa trip, Flat 402, Weekend crew…"
                autoComplete="off"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JoinGroupDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCode("");
      setError("");
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) {
      setError("Paste the invite code someone shared with you.");
      document.getElementById("invite-code")?.focus();
      return;
    }

    setSaving(true);
    const response = await fetch("/api/private/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: code.trim().toUpperCase() }),
    });
    setSaving(false);

    if (!response.ok) {
      setError(
        await readApiError(
          response,
          "That code didn't work. Check it with whoever shared it.",
        ),
      );
      return;
    }

    toast.success("You've joined the group");
    onOpenChange(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join a group</DialogTitle>
          <DialogDescription>
            Enter the invite code from an existing member.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="py-4">
            <Field
              label="Invite code"
              htmlFor="invite-code"
              required
              error={error || undefined}
              hint="Case doesn't matter — we'll normalise it."
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono tracking-[0.2em]"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Join group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────── */

export function GroupManager() {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const { data, isLoading, error, reload } =
    useQuery<{ groups: Group[] }>("/api/private/groups");
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();

  const handleDelete = async (group: Group) => {
    const isOwner = group.members.some(
      (m) => m.userId._id === session?.user?.id && m.role === "owner",
    );

    const ok = await confirm({
      title: isOwner ? `Delete "${group.name}"?` : `Leave "${group.name}"?`,
      description: isOwner
        ? "This permanently deletes the group along with its expenses and settlements for every member. It can't be undone."
        : "You'll no longer see this group's expenses or balances. Other members keep the group.",
      confirmLabel: isOwner ? "Delete" : "Leave",
      destructive: true,
    });
    if (!ok) return;

    const response = await fetch(`/api/private/groups/${group._id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      toast.error(await readApiError(response, "Couldn't remove this group"));
      return;
    }

    toast.success(isOwner ? "Group deleted" : "You left the group");
    reload();
  };

  if (isLoading) {
    return (
      <LoadingRegion label="Loading your groups" className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </LoadingRegion>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Couldn't load your groups"
        description="The request didn't come back. Check your connection and try again."
        onRetry={reload}
      />
    );
  }

  const actions = (
    <>
      <Button variant="outline" onClick={() => setJoinOpen(true)}>
        <UserPlus className="size-4" />
        Join with code
      </Button>
      <Button onClick={() => setCreateOpen(true)}>
        <Plus className="size-4" />
        New group
      </Button>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">{actions}</div>

      {data.groups.length ? (
        <ul className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.groups.map((group) => {
            const isOwner = group.members.some(
              (m) => m.userId._id === session?.user?.id && m.role === "owner",
            );

            return (
            <li key={group._id}>
              <Card interactive className="group flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 truncate font-medium">{group.name}</h3>
                  {group.members.some((m) => m.role === "owner") && (
                    <Badge variant="secondary" className="shrink-0">
                      {group.members.find((m) => m.role === "owner")?.userId.name.split(" ")[0]}
                      &rsquo;s
                    </Badge>
                  )}
                </div>

                <div className="mt-4">
                  <MemberStack members={group.members} />
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
                  <div className="flex items-center gap-1">
                    <InviteCode code={group.inviteCode} />
                    <Tooltip content={isOwner ? "Delete group" : "Leave group"}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(group)}
                      >
                        {isOwner ? (
                          <Trash2 className="size-3.5" />
                        ) : (
                          <LogOut className="size-3.5" />
                        )}
                        <span className="sr-only">Remove group</span>
                      </Button>
                    </Tooltip>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/groups/${group._id}`}>
                      Open
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                </div>
              </Card>
            </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Users}
          title="No groups yet"
          description="Create a group for a trip, a flat, or a regular crew — then log shared expenses and settle up without spreadsheets."
          action={
            <div className="flex flex-wrap justify-center gap-2">{actions}</div>
          }
        />
      )}

      <CreateGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onDone={reload}
      />
      <JoinGroupDialog open={joinOpen} onOpenChange={setJoinOpen} onDone={reload} />
      {confirmDialog}
    </div>
  );
}
