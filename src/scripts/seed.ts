import { hash } from "bcryptjs";
import mongoose from "mongoose";
import { connectToDatabase } from "../lib/db";
import { ensureDefaultCategories } from "../lib/default-categories";
import { generateInviteCode } from "../lib/invite-code";
import { Budget } from "../models/Budget";
import { Category } from "../models/Category";
import { Group } from "../models/Group";
import { GroupExpense } from "../models/GroupExpense";
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
    { upsert: true, new: true },
  );
}

async function seed() {
  await connectToDatabase();
  await ensureDefaultCategories();

  const [alex, riya] = await Promise.all([
    upsertDemoUser("Alex Demo", "alex@feenance.demo", "Demo@1234"),
    upsertDemoUser("Riya Demo", "riya@feenance.demo", "Demo@1234"),
  ]);

  const [salaryCategory, foodCategory] = await Promise.all([
    Category.findOne({ isSystem: true, name: "Salary", type: "income" }),
    Category.findOne({ isSystem: true, name: "Food", type: "expense" }),
  ]);

  if (!salaryCategory || !foodCategory) {
    throw new Error("Default categories were not initialized correctly");
  }

  await Transaction.deleteMany({ userId: { $in: [alex._id, riya._id] } });
  await Budget.deleteMany({ userId: { $in: [alex._id, riya._id] } });

  await Transaction.insertMany([
    {
      userId: alex._id,
      type: "income",
      title: "Primary Salary",
      amount: 85000,
      currency: "INR",
      categoryId: salaryCategory._id,
      transactionDate: new Date(),
      recurring: {
        enabled: true,
        frequency: "monthly",
        nextRunAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      },
    },
    {
      userId: alex._id,
      type: "expense",
      title: "Weekend Dining",
      amount: 3200,
      currency: "INR",
      categoryId: foodCategory._id,
      transactionDate: new Date(),
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
      transactionDate: new Date(),
      recurring: {
        enabled: false,
      },
    },
  ]);

  await Budget.insertMany([
    {
      userId: alex._id,
      name: "Food Budget",
      amount: 12000,
      currency: "INR",
      cycle: "monthly",
      categoryId: foodCategory._id,
      periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
    },
    {
      userId: riya._id,
      name: "Annual Travel Fund",
      amount: 180000,
      currency: "INR",
      cycle: "yearly",
      periodStart: new Date(new Date().getFullYear(), 0, 1),
      periodEnd: new Date(new Date().getFullYear(), 11, 31),
    },
  ]);

  let group = await Group.findOne({ name: "Weekend Crew" });

  if (!group) {
    group = await Group.create({
      name: "Weekend Crew",
      createdBy: alex._id,
      inviteCode: generateInviteCode(),
      members: [
        {
          userId: alex._id,
          role: "owner",
          joinedAt: new Date(),
        },
        {
          userId: riya._id,
          role: "member",
          joinedAt: new Date(),
        },
      ],
    });
  }

  await GroupExpense.deleteMany({ groupId: group._id });

  await GroupExpense.create({
    groupId: group._id,
    createdBy: alex._id,
    title: "Dinner Out",
    notes: "Shared dinner with split by percentage",
    amount: 4000,
    currency: "INR",
    splitType: "percentage",
    paidBy: [
      { userId: alex._id, amount: 2500 },
      { userId: riya._id, amount: 1500 },
    ],
    splits: [
      { userId: alex._id, percentage: 55, shareAmount: 2200 },
      { userId: riya._id, percentage: 45, shareAmount: 1800 },
    ],
    incurredAt: new Date(),
  });

  console.info("Seed complete");
  console.info("Demo accounts:");
  console.info("- alex@feenance.demo / Demo@1234");
  console.info("- riya@feenance.demo / Demo@1234");

  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
