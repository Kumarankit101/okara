import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc(
    "delete_expired_source_posts",
  );

  if (error) {
    console.error("Expired-source cleanup failed", { code: error.code });
    return Response.json({ error: "Cleanup failed" }, { status: 500 });
  }

  return Response.json({ deleted: data ?? 0 });
}
