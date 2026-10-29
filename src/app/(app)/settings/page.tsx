import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SettingsView } from "@/components/settings/settings-view";
import { getCurrentUser } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default async function SettingsPage() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: profile, error: profileError }, { data: voiceProfiles, error: voiceError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("voice_profiles")
        .select("id,handle,display_name,source_type,status,last_synced_at")
        .eq("user_id", user.id)
        .neq("status", "deleted")
        .order("updated_at", { ascending: false }),
    ]);

  if (profileError) throw profileError;
  if (voiceError) throw voiceError;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-forest">
        Workspace controls
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
        Settings
      </h1>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        Manage your account, writing voices, stored learning, and current session.
      </p>
      <div className="mt-8">
        <SettingsView
          email={user.email ?? "No email available"}
          initialDisplayName={
            profile?.display_name ??
            user.user_metadata.full_name ??
            user.user_metadata.name ??
            "Okara writer"
          }
          memberSinceLabel={dateFormatter.format(new Date(user.created_at))}
          initialVoiceProfiles={(voiceProfiles ?? []).map((voiceProfile) => ({
            id: voiceProfile.id,
            name: voiceProfile.handle ? `@${voiceProfile.handle}` : voiceProfile.display_name,
            detail: voiceProfile.display_name,
            sourceLabel:
              voiceProfile.source_type === "x_api" ? "Imported from X" : "Pasted samples",
            lastSyncedLabel: voiceProfile.last_synced_at
              ? `Analyzed ${dateFormatter.format(new Date(voiceProfile.last_synced_at))}`
              : voiceProfile.status === "ready"
                ? "Ready"
                : "Analysis pending",
          }))}
        />
      </div>
    </main>
  );
}
