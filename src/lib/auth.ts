import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { connectToDatabase } from "@/lib/db";
import { env } from "@/lib/env";
import { User } from "@/models/User";

function isObjectIdLike(value: string | undefined) {
  return Boolean(value && /^[a-f\d]{24}$/i.test(value));
}

// Dev-only bypass so the app can be exercised locally while real auth
// providers (Google OAuth, Atlas-backed password hashes) are being fixed.
// Never active in production, regardless of what's in the environment.
const DEV_BYPASS_PASSWORD = "pccoe@12345";
const isDevBypassEnabled = process.env.NODE_ENV !== "production";

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Email and Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password) {
        return null;
      }

      await connectToDatabase();

      const email = credentials.email.toLowerCase();

      if (isDevBypassEnabled && credentials.password === DEV_BYPASS_PASSWORD) {
        const devUser =
          (await User.findOne({ email }).lean()) ??
          (await User.create({
            email,
            name: email.split("@")[0],
          })).toObject();

        return {
          id: devUser._id.toString(),
          email: devUser.email,
          name: devUser.name,
          image: devUser.image,
        };
      }

      const user = await User.findOne({ email }).lean();

      if (!user?.passwordHash) {
        return null;
      }

      const isValid = await compare(credentials.password, user.passwordHash);

      if (!isValid) {
        return null;
      }

      return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),
];

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  secret: env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 7,
  },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") {
        return true;
      }

      if (!user.email) {
        return false;
      }

      await connectToDatabase();

      const existing = await User.findOne({ email: user.email.toLowerCase() });

      if (!existing) {
        await User.create({
          email: user.email.toLowerCase(),
          name: user.name ?? user.email.split("@")[0],
          image: user.image,
          googleId: user.id,
        });
      } else if (!existing.googleId) {
        existing.googleId = user.id;
        existing.image = user.image ?? existing.image;
        await existing.save();
      }

      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "credentials" && user?.id) {
        token.id = user.id;
      }

      if (!isObjectIdLike(typeof token.id === "string" ? token.id : undefined) && token.email) {
        await connectToDatabase();
        const dbUser = await User.findOne({ email: token.email.toLowerCase() }).lean();
        if (dbUser?._id) {
          token.id = dbUser._id.toString();
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
