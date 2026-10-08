import type { Metadata } from "next";

import { CopilotChat } from "@/components/copilot/copilot-chat";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Copilot" };

export default function CopilotPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Health Copilot"
        description="Ask anything about your money. The copilot reads your own ledger, budgets and goals, then tells you what it sees and what to do next."
      />
      <CopilotChat />
    </div>
  );
}
