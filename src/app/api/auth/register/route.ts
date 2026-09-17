import { hash } from "bcryptjs";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { isMongoDuplicateKeyError } from "@/lib/mongo-errors";
import { User } from "@/models/User";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());

    await connectToDatabase();

    const existing = await User.findOne({ email: payload.email.toLowerCase() }).lean();

    if (existing) {
      return jsonError("An account with this email already exists", 409);
    }

    const passwordHash = await hash(payload.password, 12);

    const user = await User.create({
      name: payload.name,
      email: payload.email.toLowerCase(),
      passwordHash,
    });

    return Response.json(
      {
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid input", 422);
    }

    // Two concurrent registrations for the same email can both pass the
    // check-then-create lookup above; the unique index is what actually
    // stops the duplicate, so it needs to map back to the same 409.
    if (isMongoDuplicateKeyError(error)) {
      return jsonError("An account with this email already exists", 409);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to register user", 500);
  }
}
