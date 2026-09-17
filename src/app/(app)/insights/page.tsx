import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { InsightsSuite } from "@/components/insights/insights-suite";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Where your balance is heading, and what looks out of place in the ledger behind it."
      />
      <InsightsSuite />
    </div>
  );
}
