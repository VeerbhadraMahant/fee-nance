"use client";

import { useEffect, useRef, useState } from "react";
import {
  dashboardRangeLabel,
  dashboardRangeValues,
  defaultUserPreferences,
  type DashboardDefaultRange,
} from "@/lib/user-preferences";

interface Category {
  _id: string;
  name: string;
  type: "income" | "expense";
  isSystem: boolean;
  color?: string;
}

interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    preferences: {
      currency: "INR";
      dashboardDefaultRange: DashboardDefaultRange;
    };
  };
}

interface CategoriesResponse {
  categories: Category[];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

export function ProfilePage({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  // ── Profile state ──────────────────────────────────────────────────────
  const [name, setName] = useState(userName);
  const [email] = useState(userEmail);
  const [dashboardDefaultRange, setDashboardDefaultRange] =
    useState<DashboardDefaultRange>(defaultUserPreferences.dashboardDefaultRange);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // ── Category state ─────────────────────────────────────────────────────
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"income" | "expense">("expense");
  const [catError, setCatError] = useState("");
  const newCatInputRef = useRef<HTMLInputElement>(null);

  // ── Load profile ───────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/private/me", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as MeResponse;
        if (!mounted) return;
        setName(data.user.name);
        setDashboardDefaultRange(data.user.preferences.dashboardDefaultRange);
      } finally {
        if (mounted) setIsLoadingProfile(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  // ── Load categories ────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/private/categories", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as CategoriesResponse;
        if (!mounted) return;
        setCustomCategories(data.categories.filter((c) => !c.isSystem));
      } finally {
        if (mounted) setIsLoadingCats(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (addingCat) newCatInputRef.current?.focus();
  }, [addingCat]);

  // ── Save profile ───────────────────────────────────────────────────────
  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setIsSaving(true);
    const res = await fetch("/api/private/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, preferences: { currency: "INR", dashboardDefaultRange } }),
    });
    setIsSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setProfileError(data?.error ?? "Failed to save");
      return;
    }
    setProfileSuccess("Profile updated");
    setIsEditing(false);
    setTimeout(() => setProfileSuccess(""), 3000);
  };

  // ── Delete category chip ───────────────────────────────────────────────
  const handleDeleteCategory = async (id: string) => {
    setCatError("");
    const res = await fetch(`/api/private/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setCatError(data?.error ?? "Failed to delete");
      return;
    }
    setCustomCategories((prev) => prev.filter((c) => c._id !== id));
  };

  // ── Add category ───────────────────────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setCatError("");
    const res = await fetch("/api/private/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName.trim(), type: newCatType }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setCatError(data?.error ?? "Failed to create");
      return;
    }
    const data = (await res.json()) as { category: Category };
    setCustomCategories((prev) => [...prev, data.category]);
    setNewCatName("");
    setAddingCat(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="px-1 pt-2">
          <p className="section-overline">The Sovereign</p>
          <h1 className="mt-2 font-display text-[52px] leading-none text-[var(--color-text)] md:text-[72px]">
            Control your <span className="display-highlight">identity.</span>
          </h1>
          <p className="mt-3 max-w-[480px] text-[15px] text-[var(--color-text-secondary)]">
            Manage your personal details, custom categories, and account preferences from one place.
          </p>
        </section>

        {/* ── Identity card ────────────────────────────────────────────── */}
        <div className="panel p-6 md:p-8">
          {isLoadingProfile ? (
            <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          ) : isEditing ? (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="section-overline mb-1">Edit Profile</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">Update your display name and dashboard preference.</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setIsEditing(false); setProfileError(""); }}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required minLength={2} maxLength={80}
                    className="vault-input w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Email</label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="vault-input w-full opacity-50 cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Dashboard Range</label>
                  <select
                    value={dashboardDefaultRange}
                    onChange={(e) => setDashboardDefaultRange(e.target.value as DashboardDefaultRange)}
                    className="vault-input w-full"
                  >
                    {dashboardRangeValues.map((v) => (
                      <option key={v} value={v}>{dashboardRangeLabel[v]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Currency</label>
                  <input value="INR ₹" readOnly className="vault-input w-full opacity-50 cursor-not-allowed" />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={isSaving} className="btn-primary px-5 py-2 text-sm font-medium disabled:opacity-60">
                  {isSaving ? "Saving…" : "Save Changes"}
                </button>
                {profileError && <p className="text-sm text-red-400">{profileError}</p>}
                {profileSuccess && <p className="text-sm text-emerald-400">{profileSuccess}</p>}
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              {/* Avatar */}
              <div className="vault-avatar flex-shrink-0">
                <span className="font-display text-[22px]">{getInitials(name)}</span>
              </div>

              {/* Identity */}
              <div className="flex-1">
                <p className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--color-text)]">{name}</p>
                <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{email}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="vault-badge">Verified Identity</span>
                  <span className="vault-badge vault-badge--dim">Currency · INR</span>
                  <span className="vault-badge vault-badge--dim">
                    Range · {dashboardRangeLabel[dashboardDefaultRange]}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsEditing(true)}
                className="btn-primary flex-shrink-0 px-5 py-2 text-sm font-medium"
              >
                Edit Profile
              </button>
            </div>
          )}
        </div>

        {/* ── Category Manager ─────────────────────────────────────────── */}
        <div className="panel p-6 md:p-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="section-overline mb-1">Category Manager</p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Your custom income and expense tags.
              </p>
            </div>
            <button
              onClick={() => { setAddingCat(true); setCatError(""); }}
              className="vault-chip-add flex items-center gap-1.5 text-sm"
              disabled={addingCat}
            >
              <span className="text-base leading-none">+</span> New Tag
            </button>
          </div>

          {isLoadingCats ? (
            <p className="text-sm text-[var(--color-muted)]">Loading categories…</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {customCategories.map((cat) => (
                  <span key={cat._id} className={`vault-chip vault-chip--${cat.type}`}>
                    {cat.name}
                    <button
                      onClick={() => void handleDeleteCategory(cat._id)}
                      className="vault-chip-x ml-1.5"
                      aria-label={`Remove ${cat.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {customCategories.length === 0 && !addingCat && (
                  <p className="text-sm text-[var(--color-text-tertiary)]">No custom categories yet.</p>
                )}
              </div>

              {addingCat && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    ref={newCatInputRef}
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Category name…"
                    maxLength={50}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAddCategory(); if (e.key === "Escape") setAddingCat(false); }}
                    className="vault-input w-52"
                  />
                  <select
                    value={newCatType}
                    onChange={(e) => setNewCatType(e.target.value as "income" | "expense")}
                    className="vault-input w-32"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                  <button onClick={() => void handleAddCategory()} className="btn-primary px-4 py-2 text-sm">
                    Add
                  </button>
                  <button onClick={() => { setAddingCat(false); setNewCatName(""); setCatError(""); }} className="btn-ghost px-3 py-2 text-sm">
                    Cancel
                  </button>
                  {catError && <p className="w-full text-sm text-red-400">{catError}</p>}
                </div>
              )}

              {!addingCat && catError && (
                <p className="mt-2 text-sm text-red-400">{catError}</p>
              )}
            </>
          )}
        </div>

        {/* ── Danger Zone ──────────────────────────────────────────────── */}
        <div className="vault-danger-zone p-6 md:p-8">
          <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--color-danger)]">
            Danger Zone
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium text-[var(--color-text)]">Delete Account</p>
              <p className="mt-0.5 max-w-[440px] text-sm text-[var(--color-text-secondary)]">
                Permanently remove your identity and erase all transaction metadata. This action is irreversible.
              </p>
            </div>
            <button
              disabled
              className="rounded-md border border-[var(--color-danger)] bg-[rgba(163,45,45,0.12)] px-5 py-2 text-sm font-medium text-[var(--color-danger)] opacity-60 cursor-not-allowed transition-all"
            >
              Delete Account
            </button>
          </div>
        </div>

    </div>
  );
}
