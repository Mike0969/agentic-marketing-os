import { exchangeCode, resolveAccount } from "@/lib/social/facebook";
import { handleSocialOAuthCallback } from "@/lib/social/oauth-routes";

export async function GET(request: Request) {
  return handleSocialOAuthCallback(request, { platform: "facebook", exchangeCode, resolveAccount });
}
