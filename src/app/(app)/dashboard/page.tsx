import type { Metadata } from "next";

import { Workspace } from "@/components/workspace/workspace";

export const metadata: Metadata = { title: "Write" };

export default function DashboardPage() {
  return <Workspace />;
}
