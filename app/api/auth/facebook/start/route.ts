import { facebookConfigured, getAuthorizeUrl } from "@/lib/social/facebook";
import { startSocialOAuth } from "@/lib/social/oauth-routes";

export async function GET(request: Request) {
  return startSocialOAuth(request, {
    platform: "facebook",
    configured: facebookConfigured,
    getAuthorizeUrl,
    missingMessage: "Facebook is not configured. Set FACEBOOK_CLIENT_ID and FACEBOOK_CLIENT_SECRET."
  });
}
