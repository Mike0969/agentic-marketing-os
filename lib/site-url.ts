/**
 * The public origin of the app. Behind a proxy (Tailscale Funnel → 127.0.0.1:3470) request.url is the
 * INTERNAL address, so every redirect a browser follows must be built from NEXT_PUBLIC_SITE_URL, never
 * from the request. Falls back to the request's origin only when the site URL is not set (local dev).
 */
export function publicOrigin(requestUrl: string | URL): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      return new URL(site).origin;
    } catch {
      // malformed site URL: fall through to the request origin
    }
  }
  return new URL(requestUrl).origin;
}

/** An absolute URL on the public origin for a same-site path. */
export function publicUrl(path: string, requestUrl: string | URL): URL {
  return new URL(path, publicOrigin(requestUrl));
}

/** Only same-site relative paths ("/x"), never "//host" or "https://host" (no open redirect). */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
