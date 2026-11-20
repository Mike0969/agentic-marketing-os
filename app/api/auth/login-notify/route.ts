import { NextResponse } from "next/server";
import { notifyOperator } from "@/lib/marketing/notify";
import { createClient } from "@/lib/supabase/server";

// Called by the login page right after a successful sign-in. Middleware already requires an admin
// session on this path; the user is read again here only to name who logged in.
export async function POST() {
  const supabase = await createClient();
  const email = supabase ? (await supabase.auth.getUser()).data.user?.email : undefined;
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });
  await notifyOperator(`🔐 ${email} logged in to the platform`);
  return NextResponse.json({ ok: true });
}
