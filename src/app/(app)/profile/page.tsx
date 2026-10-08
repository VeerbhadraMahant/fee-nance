import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/current-user";
import { PageHeader } from "@/components/layout/page-header";
import { ProfilePage } from "@/components/profile/profile-page";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfileRoute() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your account details, appearance, and custom categories."
      />
      <ProfilePage
        userName={user?.name ?? ""}
        userEmail={user?.email ?? ""}
      />
    </div>
  );
}
