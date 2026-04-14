import { hash } from "bcryptjs";
import mongoose from "mongoose";
import { connectToDatabase } from "../lib/db";
import { ensureDefaultCategories } from "../lib/default-categories";
import { generateInviteCode } from "../lib/invite-code";
import { logger } from "../lib/logger";
import { Budget } from "../models/Budget";
import { Category } from "../models/Category";
import { Group } from "../models/Group";
import { GroupExpense } from "../models/GroupExpense";
import { Settlement } from "../models/Settlement";
import { Transaction } from "../models/Transaction";
import { User } from "../models/User";

async function upsertDemoUser(name: string, email: string, password: string) {
  const passwordHash = await hash(password, 12);

  return User.findOneAndUpdate(
    { email: email.toLowerCase() },
    {
      $set: {
        name,
        email: email.toLowerCase(),
        passwordHash,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
}

function atDate(monthOffset: number, day: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + monthOffset, day, 10, 0, 0, 0);
}

function monthBounds(monthOffset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function yearBounds() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
  };
}

async function getUniqueInviteCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateInviteCode(8);
    const exists = await Group.exists({ inviteCode: code });
    if (!exists) {
      return code;
    }
  }

  throw new Error("Unable to generate unique invite code for demo group");
}

async function seed() {
  await connectToDatabase();
  await ensureDefaultCategories();

  const [alex, riya, kabir, priya, arjun, nisha, dev, sneha, rahul] = await Promise.all([
    upsertDemoUser("Alex Demo", "alex@feenance.demo", "Demo@1234"),
    upsertDemoUser("Riya Demo", "riya@feenance.demo", "Demo@1234"),
    upsertDemoUser("Kabir Demo", "kabir@feenance.demo", "Demo@1234"),
    upsertDemoUser("Priya Sharma", "priya@feenance.demo", "Demo@1234"),
    upsertDemoUser("Arjun Mehta", "arjun@feenance.demo", "Demo@1234"),
    upsertDemoUser("Nisha Kapoor", "nisha@feenance.demo", "Demo@1234"),
    upsertDemoUser("Dev Patel", "dev@feenance.demo", "Demo@1234"),
    upsertDemoUser("Sneha Iyer", "sneha@feenance.demo", "Demo@1234"),
    upsertDemoUser("Rahul Gupta", "rahul@feenance.demo", "Demo@1234"),
  ]);

  const [salaryCategory, freelanceCategory, foodCategory, rentCategory, travelCategory, shoppingCategory, utilitiesCategory] = await Promise.all([
    Category.findOne({ isSystem: true, name: "Salary", type: "income" }),
    Category.findOne({ isSystem: true, name: "Freelance", type: "income" }),
    Category.findOne({ isSystem: true, name: "Food", type: "expense" }),
    Category.findOne({ isSystem: true, name: "Rent", type: "expense" }),
    Category.findOne({ isSystem: true, name: "Travel", type: "expense" }),
    Category.findOne({ isSystem: true, name: "Shopping", type: "expense" }),
    Category.findOne({ isSystem: true, name: "Utilities", type: "expense" }),
  ]);

  if (
    !salaryCategory ||
    !freelanceCategory ||
    !foodCategory ||
    !rentCategory ||
    !travelCategory ||
    !shoppingCategory ||
    !utilitiesCategory
  ) {
    throw new Error("Default categories were not initialized correctly");
  }

  const demoUserIds = [alex._id, riya._id, kabir._id, priya._id, arjun._id, nisha._id, dev._id, sneha._id, rahul._id];

  await Promise.all([
    Transaction.deleteMany({ userId: { $in: demoUserIds } }),
    Budget.deleteMany({ userId: { $in: demoUserIds } }),
    Category.deleteMany({ userId: { $in: demoUserIds }, isSystem: false }),
  ]);

  const [alexHealthCategory, riyaLearningCategory, kabirFitnessCategory] = await Promise.all([
    Category.findOneAndUpdate(
      { userId: alex._id, name: "Health", type: "expense" },
      {
        $set: {
          icon: "heart-pulse",
          color: "#7F77DD",
          isSystem: false,
        },
      },
      { upsert: true, returnDocument: "after" },
    ),
    Category.findOneAndUpdate(
      { userId: riya._id, name: "Learning", type: "expense" },
      {
        $set: {
          icon: "book-open",
          color: "#7F77DD",
          isSystem: false,
        },
      },
      { upsert: true, returnDocument: "after" },
    ),
    Category.findOneAndUpdate(
      { userId: kabir._id, name: "Fitness", type: "expense" },
      {
        $set: {
          icon: "activity",
          color: "#7F77DD",
          isSystem: false,
        },
      },
      { upsert: true, returnDocument: "after" },
    ),
  ]);

  const [
    priyaFashionCategory,
    arjunTechGearCategory,
    nishaPetCareCategory,
    devEntertainmentCategory,
    snehaWellnessCategory,
    rahulDiningCategory,
  ] = await Promise.all([
    Category.findOneAndUpdate(
      { userId: priya._id, name: "Fashion", type: "expense" },
      { $set: { icon: "shirt", color: "#E879A0", isSystem: false } },
      { upsert: true, returnDocument: "after" },
    ),
    Category.findOneAndUpdate(
      { userId: arjun._id, name: "Tech Gear", type: "expense" },
      { $set: { icon: "cpu", color: "#3B82F6", isSystem: false } },
      { upsert: true, returnDocument: "after" },
    ),
    Category.findOneAndUpdate(
      { userId: nisha._id, name: "Pet Care", type: "expense" },
      { $set: { icon: "paw-print", color: "#F97316", isSystem: false } },
      { upsert: true, returnDocument: "after" },
    ),
    Category.findOneAndUpdate(
      { userId: dev._id, name: "Entertainment", type: "expense" },
      { $set: { icon: "tv", color: "#8B5CF6", isSystem: false } },
      { upsert: true, returnDocument: "after" },
    ),
    Category.findOneAndUpdate(
      { userId: sneha._id, name: "Wellness", type: "expense" },
      { $set: { icon: "sparkles", color: "#10B981", isSystem: false } },
      { upsert: true, returnDocument: "after" },
    ),
    Category.findOneAndUpdate(
      { userId: rahul._id, name: "Dining Out", type: "expense" },
      { $set: { icon: "utensils", color: "#F59E0B", isSystem: false } },
      { upsert: true, returnDocument: "after" },
    ),
  ]);

  await Transaction.insertMany([
    {
      userId: alex._id,
      type: "income",
      title: "Primary Salary",
      amount: 85000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: atDate(0, 1),
      recurring: {
        enabled: true,
        frequency: "monthly",
        nextRunAt: atDate(1, 1),
      },
    },
    {
      userId: alex._id,
      type: "income",
      title: "Quarterly Consulting",
      amount: 22000,
      currency: "INR",
      categoryId: freelanceCategory._id,
      transactionDate: atDate(-1, 19),
      recurring: {
        enabled: false,
      },
    },
    {
      userId: alex._id,
      type: "expense",
      title: "Apartment Rent",
      amount: 28000,
      currency: "INR",
      categoryId: rentCategory._id,
      transactionDate: atDate(0, 3),
      recurring: {
        enabled: true,
        frequency: "monthly",
        nextRunAt: atDate(1, 3),
      },
    },
    {
      userId: alex._id,
      type: "expense",
      title: "Weekend Dining",
      amount: 3200,
      currency: "INR",
      categoryId: foodCategory._id,
      transactionDate: atDate(0, 7),
      recurring: {
        enabled: false,
      },
    },
    {
      userId: alex._id,
      type: "expense",
      title: "Dental Checkup",
      amount: 5400,
      currency: "INR",
      categoryId: alexHealthCategory._id,
      transactionDate: atDate(-1, 11),
      recurring: {
        enabled: false,
      },
    },
    {
      userId: alex._id,
      type: "expense",
      title: "Electricity Bill",
      amount: 2400,
      currency: "INR",
      categoryId: utilitiesCategory._id,
      transactionDate: atDate(0, 9),
      recurring: {
        enabled: true,
        frequency: "monthly",
        nextRunAt: atDate(1, 9),
      },
    },
    {
      userId: riya._id,
      type: "income",
      title: "Primary Salary",
      amount: 72000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: atDate(0, 1),
      recurring: {
        enabled: true,
        frequency: "monthly",
        nextRunAt: atDate(1, 1),
      },
    },
    {
      userId: riya._id,
      type: "income",
      title: "Freelance Illustration",
      amount: 9800,
      currency: "INR",
      categoryId: freelanceCategory._id,
      transactionDate: atDate(-2, 16),
      recurring: {
        enabled: false,
      },
    },
    {
      userId: riya._id,
      type: "expense",
      title: "Groceries",
      amount: 2100,
      currency: "INR",
      categoryId: foodCategory._id,
      transactionDate: atDate(0, 5),
      recurring: {
        enabled: false,
      },
    },
    {
      userId: riya._id,
      type: "expense",
      title: "Frontend Course",
      amount: 4500,
      currency: "INR",
      categoryId: riyaLearningCategory._id,
      transactionDate: atDate(-1, 17),
      recurring: {
        enabled: false,
      },
    },
    {
      userId: riya._id,
      type: "expense",
      title: "Airport Cab",
      amount: 1600,
      currency: "INR",
      categoryId: travelCategory._id,
      transactionDate: atDate(-2, 24),
      recurring: {
        enabled: false,
      },
    },
    {
      userId: riya._id,
      type: "expense",
      title: "Mobile Plan",
      amount: 799,
      currency: "INR",
      categoryId: utilitiesCategory._id,
      transactionDate: atDate(0, 8),
      recurring: {
        enabled: true,
        frequency: "monthly",
        nextRunAt: atDate(1, 8),
      },
    },
    {
      userId: kabir._id,
      type: "income",
      title: "Primary Salary",
      amount: 64000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: atDate(0, 1),
      recurring: {
        enabled: true,
        frequency: "monthly",
        nextRunAt: atDate(1, 1),
      },
    },
    {
      userId: kabir._id,
      type: "expense",
      title: "Gym Membership",
      amount: 1800,
      currency: "INR",
      categoryId: kabirFitnessCategory._id,
      transactionDate: atDate(0, 4),
      recurring: {
        enabled: true,
        frequency: "monthly",
        nextRunAt: atDate(1, 4),
      },
    },
    {
      userId: kabir._id,
      type: "expense",
      title: "Headphones Purchase",
      amount: 6999,
      currency: "INR",
      categoryId: shoppingCategory._id,
      transactionDate: atDate(-1, 22),
      recurring: {
        enabled: false,
      },
    },
    {
      userId: kabir._id,
      type: "expense",
      title: "Weekend Road Trip",
      amount: 3500,
      currency: "INR",
      categoryId: travelCategory._id,
      transactionDate: atDate(-2, 12),
      recurring: {
        enabled: false,
      },
    },
  ]);

  // ── 6 new demo users: 6–12 months of financial history ──────────────────
  await Transaction.insertMany([
    // ── Priya Sharma (Designer, ₹78 K / month) ──────────────────────────
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: priya._id,
      type: "income",
      title: "Design Salary",
      amount: 78000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: atDate(i - 11, 1),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 1) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: priya._id,
      type: "expense",
      title: "Studio Apartment Rent",
      amount: 20000,
      currency: "INR",
      categoryId: rentCategory._id,
      transactionDate: atDate(i - 11, 3),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 3) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: priya._id,
      type: "expense",
      title: "Electricity & Internet",
      amount: 1800,
      currency: "INR",
      categoryId: utilitiesCategory._id,
      transactionDate: atDate(i - 11, 8),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 8) }
        : { enabled: false },
    })),
    { userId: priya._id, type: "income", title: "Freelance Brand Identity", amount: 18000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-9, 14), recurring: { enabled: false } },
    { userId: priya._id, type: "income", title: "Freelance UI Kit", amount: 12500, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-5, 20), recurring: { enabled: false } },
    { userId: priya._id, type: "income", title: "Freelance Pitch Deck", amount: 9000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-1, 17), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Cafe Lunch & Dinner", amount: 3400, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-10, 12), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Team Lunch", amount: 2800, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-8, 6), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Dining Out", amount: 1900, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-6, 18), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Restaurant Birthday Dinner", amount: 4200, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-4, 9), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Groceries & Snacks", amount: 2100, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-2, 21), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Cafe Work Sessions", amount: 1600, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(0, 6), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Summer Wardrobe Haul", amount: 8500, currency: "INR", categoryId: priyaFashionCategory._id, transactionDate: atDate(-7, 15), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Winter Jacket", amount: 4200, currency: "INR", categoryId: priyaFashionCategory._id, transactionDate: atDate(-4, 22), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Accessories Shopping", amount: 3100, currency: "INR", categoryId: priyaFashionCategory._id, transactionDate: atDate(0, 10), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Goa Trip", amount: 14500, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-7, 3), recurring: { enabled: false } },
    { userId: priya._id, type: "expense", title: "Ooty Weekend Getaway", amount: 7800, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-3, 8), recurring: { enabled: false } },
    // ── Arjun Mehta (Backend Engineer, ₹95 K / month) ───────────────────
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: arjun._id,
      type: "income",
      title: "Engineering Salary",
      amount: 95000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: atDate(i - 11, 1),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 1) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: arjun._id,
      type: "expense",
      title: "Apartment Rent",
      amount: 22000,
      currency: "INR",
      categoryId: rentCategory._id,
      transactionDate: atDate(i - 11, 2),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 2) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: arjun._id,
      type: "expense",
      title: "Electricity & Wifi",
      amount: 2100,
      currency: "INR",
      categoryId: utilitiesCategory._id,
      transactionDate: atDate(i - 11, 7),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 7) }
        : { enabled: false },
    })),
    { userId: arjun._id, type: "income", title: "OSS Consulting", amount: 25000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-10, 12), recurring: { enabled: false } },
    { userId: arjun._id, type: "income", title: "Code Review Contract", amount: 18000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-6, 18), recurring: { enabled: false } },
    { userId: arjun._id, type: "income", title: "Tech Workshop Fee", amount: 12000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-2, 9), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Lunch Near Office", amount: 2600, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-11, 15), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Weekend Brunch", amount: 1800, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-9, 20), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Grocery Run", amount: 2400, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-7, 11), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Ordered In Dinner", amount: 1200, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-5, 24), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Team Outing Lunch", amount: 3100, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-3, 13), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Quick Dinner", amount: 980, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-1, 27), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Mechanical Keyboard", amount: 9500, currency: "INR", categoryId: arjunTechGearCategory._id, transactionDate: atDate(-9, 8), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Ultrawide Monitor", amount: 32000, currency: "INR", categoryId: arjunTechGearCategory._id, transactionDate: atDate(-4, 5), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Mechanical Switch Pack", amount: 2800, currency: "INR", categoryId: arjunTechGearCategory._id, transactionDate: atDate(-1, 14), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Lonavala Road Trip", amount: 5500, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-8, 25), recurring: { enabled: false } },
    { userId: arjun._id, type: "expense", title: "Mahabaleshwar Trip", amount: 9200, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-3, 17), recurring: { enabled: false } },
    // ── Nisha Kapoor (Freelance Writer, variable income) ─────────────────
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: nisha._id,
      type: "income",
      title: "Freelance Content",
      amount: [42000, 55000, 38000, 61000, 47000, 53000, 44000, 58000, 49000, 65000, 51000, 56000][i],
      currency: "INR",
      categoryId: freelanceCategory._id,
      transactionDate: atDate(i - 11, 5),
      recurring: { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: nisha._id,
      type: "expense",
      title: "Studio Rent",
      amount: 18000,
      currency: "INR",
      categoryId: rentCategory._id,
      transactionDate: atDate(i - 11, 2),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 2) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: nisha._id,
      type: "expense",
      title: "Utilities & Mobile",
      amount: 1400,
      currency: "INR",
      categoryId: utilitiesCategory._id,
      transactionDate: atDate(i - 11, 9),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 9) }
        : { enabled: false },
    })),
    { userId: nisha._id, type: "expense", title: "Groceries & Cooking", amount: 2800, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-10, 14), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Cafe Work Day", amount: 1100, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-8, 6), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Restaurant Dinner", amount: 2400, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-6, 22), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Meal Prep Grocery", amount: 3100, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-4, 18), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Friend Lunch", amount: 1600, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-2, 9), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Takeout & Delivery", amount: 1800, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(0, 7), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Pet Food & Vet Visit", amount: 3200, currency: "INR", categoryId: nishaPetCareCategory._id, transactionDate: atDate(-10, 20), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Pet Checkup", amount: 1800, currency: "INR", categoryId: nishaPetCareCategory._id, transactionDate: atDate(-7, 12), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Pet Food Monthly", amount: 1400, currency: "INR", categoryId: nishaPetCareCategory._id, transactionDate: atDate(-4, 5), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Mumbai–Pune Bus", amount: 800, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-10, 7), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Goa Working Retreat", amount: 16000, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-6, 10), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Flight to Delhi", amount: 5600, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-2, 14), recurring: { enabled: false } },
    { userId: nisha._id, type: "expense", title: "Copywriting Masterclass", amount: 6500, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-9, 18), recurring: { enabled: false } },
    // ── Dev Patel (Data Analyst, ₹68 K / month) ──────────────────────────
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: dev._id,
      type: "income",
      title: "Analytics Salary",
      amount: 68000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: atDate(i - 11, 1),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 1) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: dev._id,
      type: "expense",
      title: "PG Accommodation",
      amount: 15000,
      currency: "INR",
      categoryId: rentCategory._id,
      transactionDate: atDate(i - 11, 1),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 1) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: dev._id,
      type: "expense",
      title: "Mobile & Internet",
      amount: 999,
      currency: "INR",
      categoryId: utilitiesCategory._id,
      transactionDate: atDate(i - 11, 10),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 10) }
        : { enabled: false },
    })),
    { userId: dev._id, type: "income", title: "Data Dashboard Contract", amount: 22000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-8, 14), recurring: { enabled: false } },
    { userId: dev._id, type: "income", title: "SQL Training Session", amount: 8000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-4, 19), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Canteen Lunch", amount: 1400, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-11, 20), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Food Court Dinner", amount: 900, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-9, 14), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Swiggy Order", amount: 780, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-7, 25), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Weekend Lunch Out", amount: 1800, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-5, 18), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Team Zomato Order", amount: 2600, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-3, 8), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Grocery Haul", amount: 2200, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-1, 16), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Concert Ticket", amount: 3500, currency: "INR", categoryId: devEntertainmentCategory._id, transactionDate: atDate(-10, 22), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Movie & Bowling Night", amount: 2100, currency: "INR", categoryId: devEntertainmentCategory._id, transactionDate: atDate(-7, 16), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "IPL Match Ticket", amount: 4200, currency: "INR", categoryId: devEntertainmentCategory._id, transactionDate: atDate(-4, 9), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Gaming Top-up", amount: 1500, currency: "INR", categoryId: devEntertainmentCategory._id, transactionDate: atDate(-1, 22), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Hyderabad–Goa Flight", amount: 6400, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-9, 5), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Shirdi Trip", amount: 4200, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-3, 20), recurring: { enabled: false } },
    { userId: dev._id, type: "expense", title: "Festival Clothes", amount: 5800, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-6, 11), recurring: { enabled: false } },
    // ── Sneha Iyer (UX Researcher, ₹71 K / month) ────────────────────────
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: sneha._id,
      type: "income",
      title: "Research Salary",
      amount: 71000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: atDate(i - 11, 1),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 1) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: sneha._id,
      type: "expense",
      title: "Apartment Rent",
      amount: 17000,
      currency: "INR",
      categoryId: rentCategory._id,
      transactionDate: atDate(i - 11, 3),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 3) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: sneha._id,
      type: "expense",
      title: "Utilities Bundle",
      amount: 1650,
      currency: "INR",
      categoryId: utilitiesCategory._id,
      transactionDate: atDate(i - 11, 7),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 7) }
        : { enabled: false },
    })),
    { userId: sneha._id, type: "expense", title: "Home Cook Grocery", amount: 2400, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-11, 12), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Cafe Breakfast", amount: 900, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-9, 6), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Team Lunch", amount: 2100, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-7, 19), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Restaurant", amount: 1800, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-5, 24), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Grocery Order", amount: 2600, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-3, 16), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Friday Dinner", amount: 2000, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-1, 10), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "UX Research Course", amount: 7500, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-10, 18), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Udemy UI Design Bundle", amount: 3200, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-7, 22), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Annual Coursera Sub", amount: 4800, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-4, 8), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Workshop Registration", amount: 2500, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-1, 19), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Yoga Studio", amount: 2200, currency: "INR", categoryId: snehaWellnessCategory._id, transactionDate: atDate(-11, 8), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Spa & Massage", amount: 3500, currency: "INR", categoryId: snehaWellnessCategory._id, transactionDate: atDate(-8, 14), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Meditation App Premium", amount: 999, currency: "INR", categoryId: snehaWellnessCategory._id, transactionDate: atDate(-5, 4), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Wellness Retreat Day", amount: 5800, currency: "INR", categoryId: snehaWellnessCategory._id, transactionDate: atDate(-2, 16), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Chennai–Pondicherry Trip", amount: 4800, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-9, 3), recurring: { enabled: false } },
    { userId: sneha._id, type: "expense", title: "Varkala Beach Trip", amount: 11200, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-3, 11), recurring: { enabled: false } },
    // ── Rahul Gupta (Product Manager, ₹1.1 L / month) ───────────────────
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: rahul._id,
      type: "income",
      title: "PM Salary",
      amount: 110000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: atDate(i - 11, 1),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 1) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: rahul._id,
      type: "expense",
      title: "Flat Rent",
      amount: 35000,
      currency: "INR",
      categoryId: rentCategory._id,
      transactionDate: atDate(i - 11, 2),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 2) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: rahul._id,
      type: "expense",
      title: "Electricity & Maintenance",
      amount: 3200,
      currency: "INR",
      categoryId: utilitiesCategory._id,
      transactionDate: atDate(i - 11, 8),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 8) }
        : { enabled: false },
    })),
    { userId: rahul._id, type: "income", title: "Dividend Payout", amount: 15000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-9, 20), recurring: { enabled: false } },
    { userId: rahul._id, type: "income", title: "Annual Bonus", amount: 80000, currency: "INR", categoryId: salaryCategory._id, transactionDate: atDate(-5, 10), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Fancy Restaurant", amount: 6500, currency: "INR", categoryId: rahulDiningCategory._id, transactionDate: atDate(-11, 19), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Rooftop Bar Night", amount: 4200, currency: "INR", categoryId: rahulDiningCategory._id, transactionDate: atDate(-9, 14), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Sushi Omakase", amount: 8900, currency: "INR", categoryId: rahulDiningCategory._id, transactionDate: atDate(-7, 21), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Business Lunch", amount: 3800, currency: "INR", categoryId: rahulDiningCategory._id, transactionDate: atDate(-5, 16), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Sunday Brunch", amount: 5100, currency: "INR", categoryId: rahulDiningCategory._id, transactionDate: atDate(-3, 8), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Wine & Dine Evening", amount: 7200, currency: "INR", categoryId: rahulDiningCategory._id, transactionDate: atDate(-1, 24), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Groceries", amount: 3400, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-10, 8), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Grocery Delivery", amount: 2800, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-4, 12), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Nike Shoes", amount: 12000, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-10, 5), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Smart Watch", amount: 28000, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-7, 3), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Suit Purchase", amount: 18500, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-4, 17), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Clothes Haul", amount: 9200, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-1, 6), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Manali Ski Trip", amount: 28000, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-11, 5), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Bangkok Vacation", amount: 65000, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-8, 14), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Mumbai Weekend Trip", amount: 8500, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-5, 22), recurring: { enabled: false } },
    { userId: rahul._id, type: "expense", title: "Kerala Backwaters Trip", amount: 22000, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-2, 10), recurring: { enabled: false } },
  ]);

  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);
  const thisYear = yearBounds();

  await Budget.insertMany([
    {
      userId: alex._id,
      name: "Monthly Essentials",
      amount: 42000,
      currency: "INR",
      cycle: "monthly",
      categoryId: undefined,
      periodStart: thisMonth.start,
      periodEnd: thisMonth.end,
    },
    {
      userId: riya._id,
      name: "Learning Budget",
      amount: 7000,
      currency: "INR",
      cycle: "monthly",
      categoryId: riyaLearningCategory._id,
      periodStart: thisMonth.start,
      periodEnd: thisMonth.end,
    },
    {
      userId: riya._id,
      name: "Travel Buffer",
      amount: 12000,
      currency: "INR",
      cycle: "quarterly",
      categoryId: travelCategory._id,
      periodStart: lastMonth.start,
      periodEnd: thisMonth.end,
    },
    {
      userId: kabir._id,
      name: "Fitness and Wellness",
      amount: 5000,
      currency: "INR",
      cycle: "monthly",
      categoryId: kabirFitnessCategory._id,
      periodStart: thisMonth.start,
      periodEnd: thisMonth.end,
    },
    {
      userId: alex._id,
      name: "Annual Travel Fund",
      amount: 180000,
      currency: "INR",
      cycle: "yearly",
      categoryId: travelCategory._id,
      periodStart: thisYear.start,
      periodEnd: thisYear.end,
    },
  ]);

  await Budget.insertMany([
    // Priya
    { userId: priya._id, name: "Monthly Living", amount: 35000, currency: "INR", cycle: "monthly", periodStart: thisMonth.start, periodEnd: thisMonth.end },
    { userId: priya._id, name: "Fashion Fund", amount: 10000, currency: "INR", cycle: "monthly", categoryId: priyaFashionCategory._id, periodStart: thisMonth.start, periodEnd: thisMonth.end },
    // Arjun
    { userId: arjun._id, name: "Tech Gear Budget", amount: 50000, currency: "INR", cycle: "yearly", categoryId: arjunTechGearCategory._id, periodStart: thisYear.start, periodEnd: thisYear.end },
    { userId: arjun._id, name: "Monthly Essentials", amount: 38000, currency: "INR", cycle: "monthly", periodStart: thisMonth.start, periodEnd: thisMonth.end },
    // Nisha
    { userId: nisha._id, name: "Monthly Expenses Cap", amount: 30000, currency: "INR", cycle: "monthly", periodStart: thisMonth.start, periodEnd: thisMonth.end },
    { userId: nisha._id, name: "Travel Buffer", amount: 25000, currency: "INR", cycle: "quarterly", categoryId: travelCategory._id, periodStart: lastMonth.start, periodEnd: thisMonth.end },
    // Dev
    { userId: dev._id, name: "Monthly Budget", amount: 28000, currency: "INR", cycle: "monthly", periodStart: thisMonth.start, periodEnd: thisMonth.end },
    { userId: dev._id, name: "Entertainment Limit", amount: 5000, currency: "INR", cycle: "monthly", categoryId: devEntertainmentCategory._id, periodStart: thisMonth.start, periodEnd: thisMonth.end },
    // Sneha
    { userId: sneha._id, name: "Learning & Growth", amount: 15000, currency: "INR", cycle: "quarterly", periodStart: lastMonth.start, periodEnd: thisMonth.end },
    { userId: sneha._id, name: "Wellness Budget", amount: 8000, currency: "INR", cycle: "monthly", categoryId: snehaWellnessCategory._id, periodStart: thisMonth.start, periodEnd: thisMonth.end },
    // Rahul
    { userId: rahul._id, name: "Travel Reserve", amount: 150000, currency: "INR", cycle: "yearly", categoryId: travelCategory._id, periodStart: thisYear.start, periodEnd: thisYear.end },
    { userId: rahul._id, name: "Monthly Overhead", amount: 55000, currency: "INR", cycle: "monthly", periodStart: thisMonth.start, periodEnd: thisMonth.end },
  ]);

  const existingGroups = await Group.find({
    name: { $in: ["Weekend Crew", "Flatmates 302"] },
  })
    .select("_id")
    .lean();

  const existingGroupIds = existingGroups.map((group) => group._id);

  if (existingGroupIds.length) {
    await Promise.all([
      GroupExpense.deleteMany({ groupId: { $in: existingGroupIds } }),
      Settlement.deleteMany({ groupId: { $in: existingGroupIds } }),
      Group.deleteMany({ _id: { $in: existingGroupIds } }),
    ]);
  }

  const [weekendCrew, flatmates] = await Promise.all([
    Group.create({
      name: "Weekend Crew",
      createdBy: alex._id,
      inviteCode: await getUniqueInviteCode(),
      members: [
        { userId: alex._id, role: "owner", joinedAt: atDate(-3, 5) },
        { userId: riya._id, role: "member", joinedAt: atDate(-3, 6) },
        { userId: kabir._id, role: "member", joinedAt: atDate(-2, 2) },
      ],
    }),
    Group.create({
      name: "Flatmates 302",
      createdBy: riya._id,
      inviteCode: await getUniqueInviteCode(),
      members: [
        { userId: riya._id, role: "owner", joinedAt: atDate(-4, 9) },
        { userId: alex._id, role: "member", joinedAt: atDate(-4, 10) },
      ],
    }),
  ]);

  await GroupExpense.insertMany([
    {
      groupId: weekendCrew._id,
      createdBy: alex._id,
      title: "Dinner Out",
      notes: "Equal split for all members",
      amount: 3600,
      currency: "INR",
      splitType: "equal",
      paidBy: [
        { userId: alex._id, amount: 3000 },
        { userId: riya._id, amount: 600 },
      ],
      splits: [
        { userId: alex._id, shareAmount: 1200 },
        { userId: riya._id, shareAmount: 1200 },
        { userId: kabir._id, shareAmount: 1200 },
      ],
      incurredAt: atDate(0, 8),
    },
    {
      groupId: weekendCrew._id,
      createdBy: kabir._id,
      title: "Resort Booking",
      notes: "Custom split based on room choices",
      amount: 5400,
      currency: "INR",
      splitType: "custom",
      paidBy: [{ userId: kabir._id, amount: 5400 }],
      splits: [
        { userId: alex._id, amount: 2500, shareAmount: 2500 },
        { userId: riya._id, amount: 1900, shareAmount: 1900 },
        { userId: kabir._id, amount: 1000, shareAmount: 1000 },
      ],
      incurredAt: atDate(-1, 22),
    },
    {
      groupId: weekendCrew._id,
      createdBy: riya._id,
      title: "Road Trip Fuel",
      notes: "Percentage split by travel distance",
      amount: 4200,
      currency: "INR",
      splitType: "percentage",
      paidBy: [
        { userId: alex._id, amount: 2000 },
        { userId: riya._id, amount: 1200 },
        { userId: kabir._id, amount: 1000 },
      ],
      splits: [
        { userId: alex._id, percentage: 50, shareAmount: 2100 },
        { userId: riya._id, percentage: 30, shareAmount: 1260 },
        { userId: kabir._id, percentage: 20, shareAmount: 840 },
      ],
      incurredAt: atDate(-2, 14),
    },
    {
      groupId: flatmates._id,
      createdBy: riya._id,
      title: "Monthly Groceries",
      notes: "Flatmates equal split",
      amount: 5200,
      currency: "INR",
      splitType: "equal",
      paidBy: [
        { userId: riya._id, amount: 3000 },
        { userId: alex._id, amount: 2200 },
      ],
      splits: [
        { userId: riya._id, shareAmount: 2600 },
        { userId: alex._id, shareAmount: 2600 },
      ],
      incurredAt: atDate(0, 10),
    },
  ]);

  await Settlement.insertMany([
    {
      groupId: weekendCrew._id,
      fromUserId: kabir._id,
      toUserId: alex._id,
      amount: 900,
      currency: "INR",
      note: "Partial settle for resort booking",
      settledAt: atDate(0, 12),
      createdBy: kabir._id,
    },
    {
      groupId: flatmates._id,
      fromUserId: alex._id,
      toUserId: riya._id,
      amount: 700,
      currency: "INR",
      note: "Grocery adjustment",
      settledAt: atDate(0, 15),
      createdBy: alex._id,
    },
  ]);

  logger.info("Seed complete", {
    users: 9,
    transactions: 322,
    budgets: 17,
    groups: 2,
    groupExpenses: 4,
    settlements: 2,
  });
  logger.info("Demo accounts:");
  logger.info("- alex@feenance.demo / Demo@1234");
  logger.info("- riya@feenance.demo / Demo@1234");
  logger.info("- kabir@feenance.demo / Demo@1234");
  logger.info("- priya@feenance.demo / Demo@1234");
  logger.info("- arjun@feenance.demo / Demo@1234");
  logger.info("- nisha@feenance.demo / Demo@1234");
  logger.info("- dev@feenance.demo / Demo@1234");
  logger.info("- sneha@feenance.demo / Demo@1234");
  logger.info("- rahul@feenance.demo / Demo@1234");

  await mongoose.disconnect();
}

seed().catch(async (error) => {
  logger.error("Seed execution failed", error);
  await mongoose.disconnect();
  process.exit(1);
});
