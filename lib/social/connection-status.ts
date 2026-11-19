// What the Settings page shows for a stored connection. Pure, so it is unit-tested.
export type ConnectionView = "connected" | "expiring" | "expired" | "revoked" | "not connected";

const EXPIRING_MS = 7 * 24 * 60 * 60 * 1000;

export function connectionView(
  row: { status: string; expires_at: string | null; has_refresh_token: boolean } | null | undefined,
  now = Date.now()
): ConnectionView {
  if (!row) return "not connected";
  if (row.status === "revoked") return "revoked";
  if (row.status === "expired") return "expired";
  if (!row.expires_at) return "connected";
  const left = new Date(row.expires_at).getTime() - now;
  // A refresh token renews the access token before posting, so a lapsed access token is fine.
  if (row.has_refresh_token) return "connected";
  if (left <= 0) return "expired";
  return left < EXPIRING_MS ? "expiring" : "connected";
}
