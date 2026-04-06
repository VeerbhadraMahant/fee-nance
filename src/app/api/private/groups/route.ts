import { z } from "zod";
import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { generateInviteCode } from "@/lib/invite-code";
import { jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { Group } from "@/models/Group";

const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const inviteCode = generateInviteCode(8);
    const exists = await Group.findOne({ inviteCode }).lean();
    if (!exists) {
      return inviteCode;
    }
  }

  throw new Error("Failed to generate invite code");
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const groups = await Group.find({
      "members.userId": toObjectId(userId),
    })
      .sort({ createdAt: -1 })
      .lean();

    return Response.json({ groups });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    console.error(error);
    return jsonError("Failed to load groups", 500);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = createGroupSchema.parse(await request.json());

    await connectToDatabase();

    const inviteCode = await generateUniqueInviteCode();
    const userObjectId = toObjectId(userId);

    const group = await Group.create({
      name: payload.name,
      createdBy: userObjectId,
      inviteCode,
      members: [
        {
          userId: userObjectId,
          role: "owner",
          joinedAt: new Date(),
        },
      ],
    });

    return Response.json({ group }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid group input", 422);
    }

    console.error(error);
    return jsonError("Failed to create group", 500);
  }
}
