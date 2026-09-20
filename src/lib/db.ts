import mongoose from "mongoose";
import { env } from "@/lib/env";

declare global {
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  } | undefined;
}

const globalCache = globalThis.mongooseCache ?? {
  conn: null,
  promise: null,
};

globalThis.mongooseCache = globalCache;

// Dev-only fallback: if the configured MONGODB_URI (e.g. a paused/misconfigured
// Atlas cluster) can't be reached, spin up an in-memory MongoDB so local dev
// and testing aren't blocked on external infra. Never used in production.
async function connectWithDevFallback() {
  try {
    return await mongoose.connect(env.MONGODB_URI, {
      dbName: "fee-nance",
      autoIndex: true,
      serverSelectionTimeoutMS: 8000,
    });
  } catch (err) {
    if (process.env.NODE_ENV === "production") {
      throw err;
    }

    console.warn(
      `[db] Could not reach MONGODB_URI (${(err as Error).message}). ` +
        "Falling back to an in-memory MongoDB for local development.",
    );

    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const memoryServer = await MongoMemoryServer.create();
    return mongoose.connect(memoryServer.getUri(), {
      dbName: "fee-nance",
      autoIndex: true,
    });
  }
}

export async function connectToDatabase() {
  if (globalCache.conn) {
    return globalCache.conn;
  }

  if (!globalCache.promise) {
    globalCache.promise = connectWithDevFallback();
  }

  globalCache.conn = await globalCache.promise;
  return globalCache.conn;
}
