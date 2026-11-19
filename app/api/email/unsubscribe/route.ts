import { handleUnsubscribe } from "@/lib/email/unsubscribe";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Public by design (no session): the HMAC-signed token in the link is the authorization.
export async function GET(request: Request) {
  return handleUnsubscribe(request, { db: createServiceClient() });
}

export async function POST(request: Request) {
  return handleUnsubscribe(request, { db: createServiceClient() });
}
