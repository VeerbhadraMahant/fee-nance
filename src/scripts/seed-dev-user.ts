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

/** Seeds the dev-bypass demo account (see DEV_BYPASS_PASSWORD in lib/auth.ts)
 *  with a full year of realistic activity, so the app has something to show
 *  in a demo instead of empty states. Dev/testing use only. */
const DEV_USER_EMAIL = "test@example.com";

function atDate(monthOffset: number, day: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + monthOffset, day, 10, 0, 0, 0);
}

function daysAgo(days: number, hour = 10) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, 0, 0, 0);
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
    if (!(await Group.exists({ inviteCode: code }))) {
      return code;
    }
  }
  throw new Error("Unable to generate unique invite code for dev-user seed group");
}

async function seed() {
  await connectToDatabase();
  await ensureDefaultCategories();

  const devUser = await User.findOneAndUpdate(
    { email: DEV_USER_EMAIL },
    { $setOnInsert: { email: DEV_USER_EMAIL, name: "Test" } },
    { upsert: true, returnDocument: "after" },
  );

  const [aditi, karan] = await Promise.all([
    User.findOneAndUpdate(
      { email: "aditi.rao@feenance.demo" },
      { $setOnInsert: { email: "aditi.rao@feenance.demo", name: "Aditi Rao" } },
      { upsert: true, returnDocument: "after" },
    ),
    User.findOneAndUpdate(
      { email: "karan.verma@feenance.demo" },
      { $setOnInsert: { email: "karan.verma@feenance.demo", name: "Karan Verma" } },
      { upsert: true, returnDocument: "after" },
    ),
  ]);

  const [salaryCategory, freelanceCategory, foodCategory, rentCategory, travelCategory, shoppingCategory, utilitiesCategory] =
    await Promise.all([
      Category.findOne({ isSystem: true, name: "Salary", type: "income" }),
      Category.findOne({ isSystem: true, name: "Freelance", type: "income" }),
      Category.findOne({ isSystem: true, name: "Food", type: "expense" }),
      Category.findOne({ isSystem: true, name: "Rent", type: "expense" }),
      Category.findOne({ isSystem: true, name: "Travel", type: "expense" }),
      Category.findOne({ isSystem: true, name: "Shopping", type: "expense" }),
      Category.findOne({ isSystem: true, name: "Utilities", type: "expense" }),
    ]);

  if (
    !salaryCategory || !freelanceCategory || !foodCategory ||
    !rentCategory || !travelCategory || !shoppingCategory || !utilitiesCategory
  ) {
    throw new Error("Default categories were not initialized correctly");
  }

  const [subscriptionsCategory, fitnessCategory] = await Promise.all([
    Category.findOneAndUpdate(
      { userId: devUser._id, name: "Subscriptions", type: "expense" },
      { $set: { icon: "repeat", color: "#7F77DD", isSystem: false } },
      { upsert: true, returnDocument: "after" },
    ),
    Category.findOneAndUpdate(
      { userId: devUser._id, name: "Fitness", type: "expense" },
      { $set: { icon: "activity", color: "#10B981", isSystem: false } },
      { upsert: true, returnDocument: "after" },
    ),
  ]);

  // Wipe any previous run of this script so it's safe to re-seed.
  await Promise.all([
    Transaction.deleteMany({ userId: devUser._id }),
    Budget.deleteMany({ userId: devUser._id }),
  ]);

  const existingGroup = await Group.findOne({ name: "Hostel Squad", createdBy: devUser._id }).select("_id").lean();
  if (existingGroup) {
    await Promise.all([
      GroupExpense.deleteMany({ groupId: existingGroup._id }),
      Settlement.deleteMany({ groupId: existingGroup._id }),
      Group.deleteMany({ _id: existingGroup._id }),
    ]);
  }

  await Transaction.insertMany([
    // 12 months of salary, rent, and utilities
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: devUser._id,
      type: "income",
      title: "Monthly Salary",
      amount: 75000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: atDate(i - 11, 1),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 1) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: devUser._id,
      type: "expense",
      title: "Apartment Rent",
      amount: 18000,
      currency: "INR",
      categoryId: rentCategory._id,
      transactionDate: atDate(i - 11, 3),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 3) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: devUser._id,
      type: "expense",
      title: "Electricity & Wifi",
      amount: 1600,
      currency: "INR",
      categoryId: utilitiesCategory._id,
      transactionDate: atDate(i - 11, 7),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 7) }
        : { enabled: false },
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      userId: devUser._id,
      type: "expense",
      title: "Gym Membership",
      amount: 1200,
      currency: "INR",
      categoryId: fitnessCategory._id,
      transactionDate: atDate(i - 11, 5),
      recurring: i === 11
        ? { enabled: true, frequency: "monthly", nextRunAt: atDate(1, 5) }
        : { enabled: false },
    })),

    // Freelance income, a few times a year
    { userId: devUser._id, type: "income", title: "Freelance Web Project", amount: 18000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-9, 14), recurring: { enabled: false } },
    { userId: devUser._id, type: "income", title: "Freelance Logo Design", amount: 6000, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-5, 20), recurring: { enabled: false } },
    { userId: devUser._id, type: "income", title: "Freelance Tutoring", amount: 9500, currency: "INR", categoryId: freelanceCategory._id, transactionDate: atDate(-1, 17), recurring: { enabled: false } },

    // Food spending spread across the year
    { userId: devUser._id, type: "expense", title: "Weekend Dinner", amount: 1450, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-11, 12), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Groceries", amount: 2200, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-10, 6), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Cafe with Friends", amount: 850, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-9, 18), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Food Delivery", amount: 620, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-8, 9), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Groceries", amount: 2350, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-7, 22), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Team Lunch", amount: 1100, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-6, 15), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Birthday Dinner", amount: 3200, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-5, 8), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Groceries", amount: 2100, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-4, 20), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Weekend Brunch", amount: 980, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-3, 12), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Food Delivery", amount: 740, currency: "INR", categoryId: foodCategory._id, transactionDate: atDate(-2, 6), recurring: { enabled: false } },

    // Shopping
    { userId: devUser._id, type: "expense", title: "New Headphones", amount: 4500, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-8, 3), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Winter Jacket", amount: 3200, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-6, 25), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Festival Shopping", amount: 5800, currency: "INR", categoryId: shoppingCategory._id, transactionDate: atDate(-3, 17), recurring: { enabled: false } },

    // Travel
    { userId: devUser._id, type: "expense", title: "Goa Weekend Trip", amount: 12500, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-7, 10), recurring: { enabled: false } },
    { userId: devUser._id, type: "expense", title: "Manali Road Trip", amount: 9800, currency: "INR", categoryId: travelCategory._id, transactionDate: atDate(-2, 14), recurring: { enabled: false } },

    /* ── Insights fixtures ──────────────────────────────────────────────
       A steady Food baseline (recent, so the outlier detector's window
       includes it), one clear spike, and a same-day duplicate charge. */
    ...[
      { days: 80, amount: 1100, title: "Weeknight Takeaway" },
      { days: 73, amount: 950, title: "Groceries" },
      { days: 66, amount: 1280, title: "Weeknight Takeaway" },
      { days: 59, amount: 1020, title: "Groceries" },
      { days: 52, amount: 1190, title: "Coffee & Breakfast" },
      { days: 45, amount: 1340, title: "Groceries" },
      { days: 38, amount: 1080, title: "Weeknight Takeaway" },
    ].map((entry) => ({
      userId: devUser._id,
      type: "expense",
      title: entry.title,
      amount: entry.amount,
      currency: "INR",
      categoryId: foodCategory._id,
      transactionDate: daysAgo(entry.days),
      recurring: { enabled: false },
    })),
    {
      userId: devUser._id,
      type: "expense",
      title: "Anniversary Dinner Splurge",
      amount: 9500,
      currency: "INR",
      categoryId: foodCategory._id,
      transactionDate: daysAgo(12),
      recurring: { enabled: false },
    },
    {
      userId: devUser._id,
      type: "expense",
      title: "Streaming Annual Plan",
      amount: 1499,
      currency: "INR",
      categoryId: subscriptionsCategory._id,
      transactionDate: daysAgo(15, 9),
      recurring: { enabled: false },
    },
    {
      userId: devUser._id,
      type: "expense",
      title: "Streaming Annual Plan",
      amount: 1499,
      currency: "INR",
      categoryId: subscriptionsCategory._id,
      transactionDate: daysAgo(15, 14),
      recurring: { enabled: false },
    },
  ]);

  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);
  const thisYear = yearBounds();

  await Budget.insertMany([
    { userId: devUser._id, name: "Monthly Essentials", amount: 35000, currency: "INR", cycle: "monthly", periodStart: thisMonth.start, periodEnd: thisMonth.end },
    { userId: devUser._id, name: "Food Budget", amount: 9000, currency: "INR", cycle: "monthly", categoryId: foodCategory._id, periodStart: thisMonth.start, periodEnd: thisMonth.end },
    { userId: devUser._id, name: "Travel Buffer", amount: 20000, currency: "INR", cycle: "quarterly", categoryId: travelCategory._id, periodStart: lastMonth.start, periodEnd: thisMonth.end },
    { userId: devUser._id, name: "Annual Travel Fund", amount: 60000, currency: "INR", cycle: "yearly", categoryId: travelCategory._id, periodStart: thisYear.start, periodEnd: thisYear.end },
  ]);

  const hostelSquad = await Group.create({
    name: "Hostel Squad",
    createdBy: devUser._id,
    inviteCode: await getUniqueInviteCode(),
    members: [
      { userId: devUser._id, role: "owner", joinedAt: atDate(-3, 5) },
      { userId: aditi._id, role: "member", joinedAt: atDate(-3, 6) },
      { userId: karan._id, role: "member", joinedAt: atDate(-2, 2) },
    ],
  });

  await GroupExpense.insertMany([
    {
      groupId: hostelSquad._id,
      createdBy: devUser._id,
      title: "Pizza Night",
      notes: "Equal split for all members",
      amount: 1800,
      currency: "INR",
      splitType: "equal",
      paidBy: [{ userId: devUser._id, amount: 1800 }],
      splits: [
        { userId: devUser._id, shareAmount: 600 },
        { userId: aditi._id, shareAmount: 600 },
        { userId: karan._id, shareAmount: 600 },
      ],
      incurredAt: atDate(0, 8),
    },
    {
      groupId: hostelSquad._id,
      createdBy: aditi._id,
      title: "Weekend Trip Fuel & Tolls",
      notes: "Custom split based on who drove",
      amount: 4200,
      currency: "INR",
      splitType: "custom",
      paidBy: [{ userId: aditi._id, amount: 4200 }],
      splits: [
        { userId: devUser._id, amount: 1800, shareAmount: 1800 },
        { userId: aditi._id, amount: 1400, shareAmount: 1400 },
        { userId: karan._id, amount: 1000, shareAmount: 1000 },
      ],
      incurredAt: atDate(-1, 22),
    },
    {
      groupId: hostelSquad._id,
      createdBy: karan._id,
      title: "Shared Netflix & Spotify",
      notes: "Percentage split",
      amount: 900,
      currency: "INR",
      splitType: "percentage",
      paidBy: [{ userId: karan._id, amount: 900 }],
      splits: [
        { userId: devUser._id, percentage: 34, shareAmount: 306 },
        { userId: aditi._id, percentage: 33, shareAmount: 297 },
        { userId: karan._id, percentage: 33, shareAmount: 297 },
      ],
      incurredAt: atDate(0, 4),
    },
  ]);

  await Settlement.insertMany([
    {
      groupId: hostelSquad._id,
      fromUserId: devUser._id,
      toUserId: aditi._id,
      amount: 1800,
      currency: "INR",
      note: "Settling fuel and tolls",
      settledAt: atDate(0, 12),
      createdBy: devUser._id,
    },
  ]);

  logger.info("Dev-user seed complete", {
    user: DEV_USER_EMAIL,
    transactions: 46,
    budgets: 4,
    groups: 1,
    groupExpenses: 3,
    settlements: 1,
  });

  await mongoose.disconnect();
}

seed().catch(async (error) => {
  logger.error("Dev-user seed execution failed", error);
  await mongoose.disconnect();
  process.exit(1);
});
