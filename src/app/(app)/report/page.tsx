import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { MonthlyReport } from "@/components/report/monthly-report";

export const metadata: Metadata = { title: "Monthly report" };

export default function ReportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        className="print:hidden"
        title="Monthly report"
        description="One month on a page: what came in, what went out, and how your finances stood at the end of it. Print it or save it as a PDF."
      />
      <MonthlyReport />
    </div>
  );
}
