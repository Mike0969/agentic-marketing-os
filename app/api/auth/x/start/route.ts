import { createCodeVerifier, getAuthorizeUrl, xConfigured } from "@/lib/social/x";
import { startSocialOAuth } from "@/lib/social/oauth-routes";

export async function GET(request: Request) {
  return startSocialOAuth(request, {
    platform: "x",
    configured: xConfigured,
    getAuthorizeUrl,
    makeVerifier: createCodeVerifier,
    missingMessage: "X is not configured. Set X_CLIENT_ID."
  });
}
