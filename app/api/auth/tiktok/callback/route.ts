import { exchangeCode, resolveAccount } from "@/lib/social/tiktok";
import { handleSocialOAuthCallback } from "@/lib/social/oauth-routes";

export async function GET(request: Request) {
  return handleSocialOAuthCallback(request, { platform: "tiktok", exchangeCode, resolveAccount });
}
