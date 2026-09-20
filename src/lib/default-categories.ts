import { Category } from "@/models/Category";

const DEFAULT_CATEGORIES = [
  { name: "Salary", type: "income", icon: "wallet", color: "#9D7A43" },
  { name: "Freelance", type: "income", icon: "briefcase", color: "#B88A44" },
  { name: "Food", type: "expense", icon: "utensils", color: "#C68642" },
  { name: "Rent", type: "expense", icon: "home", color: "#A7703B" },
  { name: "Travel", type: "expense", icon: "car", color: "#8F6436" },
  { name: "Shopping", type: "expense", icon: "bag", color: "#A5763F" },
  { name: "Utilities", type: "expense", icon: "bolt", color: "#7F5A31" },
] as const;

// Once this process has confirmed the system categories exist, never check
// again — they're never deleted, so re-checking on every request (this used
// to be 7 sequential upserts per call) was pure latency for no benefit.
let ensured = false;

export async function ensureDefaultCategories() {
  if (ensured) return;

  const existingCount = await Category.countDocuments({ userId: null, isSystem: true });
  if (existingCount >= DEFAULT_CATEGORIES.length) {
    ensured = true;
    return;
  }

  await Promise.all(
    DEFAULT_CATEGORIES.map((category) =>
      Category.updateOne(
        { userId: null, name: category.name, type: category.type },
        { $setOnInsert: { ...category, userId: null, isSystem: true } },
        { upsert: true },
      ),
    ),
  );
  ensured = true;
}
