import { compare } from "bcryptjs";
import mongoose from "mongoose";
import { connectToDatabase } from "../lib/db";
import { User } from "../models/User";

const EMAILS = [
  "alex@feenance.demo",
  "riya@feenance.demo",
  "kabir@feenance.demo",
  "priya@feenance.demo",
  "arjun@feenance.demo",
  "nisha@feenance.demo",
  "dev@feenance.demo",
  "sneha@feenance.demo",
  "rahul@feenance.demo",
];

async function verify() {
  await connectToDatabase();

  for (const email of EMAILS) {
    const user = await User.findOne({ email }).lean();
    if (!user) {
      console.log("MISSING  ", email);
      continue;
    }
    if (!user.passwordHash) {
      console.log("NO_HASH  ", email);
      continue;
    }
    const ok = await compare("Demo@1234", user.passwordHash);
    console.log(ok ? "OK       " : "BAD_HASH ", email);
  }

  await mongoose.disconnect();
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
