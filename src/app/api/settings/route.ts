import { profileSettingsSchema } from "@/lib/contracts";
import { routeErrorResponse } from "@/lib/http/route-error";
import { requireUser } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = profileSettingsSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ display_name: input.displayName })
      .eq("user_id", user.id)
      .select("display_name")
      .single();

    if (error) throw error;

    return Response.json({ displayName: data.display_name });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
