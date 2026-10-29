import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const instant = false;

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
