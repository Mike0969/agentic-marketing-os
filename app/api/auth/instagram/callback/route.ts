import { exchangeCode, resolveAccount } from "@/lib/social/instagram";
import { handleSocialOAuthCallback } from "@/lib/social/oauth-routes";

export async function GET(request: Request) {
  return handleSocialOAuthCallback(request, { platform: "instagram", exchangeCode, resolveAccount });
}
