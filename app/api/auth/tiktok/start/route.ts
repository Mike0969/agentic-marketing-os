import { getAuthorizeUrl, tiktokConfigured } from "@/lib/social/tiktok";
import { startSocialOAuth } from "@/lib/social/oauth-routes";

export async function GET(request: Request) {
  return startSocialOAuth(request, {
    platform: "tiktok",
    configured: tiktokConfigured,
    getAuthorizeUrl,
    missingMessage: "TikTok is not configured. Set TIKTOK_CLIENT_ID and TIKTOK_CLIENT_SECRET."
  });
}
