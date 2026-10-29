import type { Metadata } from "next";

import { Workspace } from "@/components/workspace/workspace";

export const metadata: Metadata = { title: "Write" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; draft?: string }>;
}) {
  const { run, draft } = await searchParams;
  return <Workspace restoredRunId={run} highlightedDraftId={draft} />;
}
