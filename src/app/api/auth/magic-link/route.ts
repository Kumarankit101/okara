import { z } from "zod";

import { getServerEnvironment } from "@/lib/env/server";
import { routeErrorResponse } from "@/lib/http/route-error";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ email: z.string().trim().email().max(320) });

export async function POST(request: Request) {
  try {
    const { email } = requestSchema.parse(await request.json());
    const supabase = await createClient();
    const appUrl = getServerEnvironment().NEXT_PUBLIC_APP_URL;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard` },
    });
    if (error) throw error;
    return Response.json({ message: "Check your inbox for your secure sign-in link." });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
