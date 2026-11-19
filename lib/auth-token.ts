import { createHash, timingSafeEqual } from "crypto";

/** Extracts the token from an `Authorization: Bearer <token>` header, or "" when absent. */
export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/**
 * Constant-time comparison of two secrets. Both sides are hashed first so the
 * comparison length never depends on the secret's length.
 */
export function safeTokenEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * True when the request carries a bearer token equal to the value of any of the
 * named env vars. Unset or empty env vars never match (secure default).
 */
export function hasValidBearer(
  request: Request,
  envNames: string[],
  env: Record<string, string | undefined> = process.env
): boolean {
  const provided = bearerToken(request);
  if (!provided) return false;
  let ok = false;
  // Check every candidate (no early exit) so timing does not reveal which name matched.
  for (const name of envNames) {
    const expected = env[name]?.trim();
    if (expected && safeTokenEqual(provided, expected)) ok = true;
  }
  return ok;
}
