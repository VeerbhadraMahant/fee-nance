import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { TaxPlanner } from "@/components/tax/tax-planner";
import { TAX_YEAR_LABEL } from "@/lib/tax";

export const metadata: Metadata = { title: "Tax planner" };

export default function TaxPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax planner"
        description={`New regime or old? Your ${TAX_YEAR_LABEL} income tax both ways, with the deductions your ledger suggests.`}
      />
      <TaxPlanner />
    </div>
  );
}
