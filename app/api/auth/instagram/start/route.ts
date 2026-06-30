import { getAuthorizeUrl, instagramConfigured } from "@/lib/social/instagram";
import { startSocialOAuth } from "@/lib/social/oauth-routes";

export async function GET(request: Request) {
  return startSocialOAuth(request, {
    platform: "instagram",
    configured: instagramConfigured,
    getAuthorizeUrl,
    missingMessage: "Instagram is not configured. Set INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET."
  });
}
