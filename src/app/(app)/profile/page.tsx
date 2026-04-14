import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ProfilePage } from "@/components/profile/profile-page";

export default async function ProfileRoute() {
  const session = await getServerSession(authOptions);

  return <ProfilePage userName={session?.user?.name ?? ""} userEmail={session?.user?.email ?? ""} />;
}
