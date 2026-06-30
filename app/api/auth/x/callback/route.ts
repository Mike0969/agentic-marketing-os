import { exchangeCode, resolveAccount } from "@/lib/social/x";
import { handleSocialOAuthCallback } from "@/lib/social/oauth-routes";

export async function GET(request: Request) {
  return handleSocialOAuthCallback(request, { platform: "x", exchangeCode, resolveAccount });
}
