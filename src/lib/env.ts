import { z } from "zod";

const optionalEnvSchema = z.object({
  MONGODB_URI: z.string().min(1).optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
});

const parsed = optionalEnvSchema.parse(process.env);

function getRequiredValue(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export const env = {
  get MONGODB_URI() {
    return getRequiredValue(parsed.MONGODB_URI, "MONGODB_URI");
  },
  get NEXTAUTH_URL() {
    return getRequiredValue(parsed.NEXTAUTH_URL, "NEXTAUTH_URL");
  },
  get NEXTAUTH_SECRET() {
    return getRequiredValue(parsed.NEXTAUTH_SECRET, "NEXTAUTH_SECRET");
  },
  GOOGLE_CLIENT_ID: parsed.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: parsed.GOOGLE_CLIENT_SECRET,
};
