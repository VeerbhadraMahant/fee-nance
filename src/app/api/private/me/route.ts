import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { User } from "@/models/User";

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const user = await User.findById(toObjectId(userId)).select("_id name email image").lean();

    if (!user) {
      return jsonError("User not found", 404);
    }

    return Response.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        image: user.image,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    console.error(error);
    return jsonError("Failed to load user profile", 500);
  }
}
