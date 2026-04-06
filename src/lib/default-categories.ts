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

export async function ensureDefaultCategories() {
  for (const category of DEFAULT_CATEGORIES) {
    await Category.updateOne(
      { userId: null, name: category.name, type: category.type },
      {
        $setOnInsert: {
          ...category,
          userId: null,
          isSystem: true,
        },
      },
      { upsert: true },
    );
  }
}
