import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { GoalsManager } from "@/components/goals/goals-manager";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        description="What you're saving for, and when what you actually save each month gets you there."
      />
      <GoalsManager />
    </div>
  );
}
