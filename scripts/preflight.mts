// Autonomy preflight — prints, in plain English, whether the autonomous loop is
// wired for real operation or running in fallback. Reads .env.local via the shared
// loader; performs no network calls; prints no secret values.
//
//   npm run preflight
//
// Exit 0 when every REQUIRED capability is ready, else exit 1 (so CI/deploy gates
// can block a half-wired launch).
import { loadLocalEnv } from "./env-loader.mjs";
import { computeReadiness, type CapabilityStatus, type CapabilityTier } from "../lib/health/readiness.ts";

loadLocalEnv();

const report = computeReadiness(process.env as Record<string, string | undefined>);

const mark: Record<CapabilityStatus, string> = { ready: "✓", disabled: "•", missing: "✗" };
const tierLabel: Record<CapabilityTier, string> = { required: "REQUIRED", recommended: "recommended", optional: "optional" };

const banner: Record<string, string> = {
  autonomous: "AUTONOMOUS — the loop can run unattended and produce real work.",
  degraded: "DEGRADED — partly wired; some required pieces are missing.",
  fallback: "FALLBACK — running on placeholders only."
};

console.log("");
console.log(`Autonomy readiness: ${banner[report.overall] ?? report.overall}`);
console.log(report.summary);
console.log(`Required capabilities ready: ${report.requiredReady}/${report.requiredTotal}`);
console.log("");

for (const c of report.capabilities) {
  console.log(`${mark[c.status]} [${tierLabel[c.tier]}] ${c.label}`);
  console.log(`    ${c.detail}`);
  if (c.status !== "ready" && c.missingEnv.length) {
    console.log(`    set: ${c.missingEnv.join(", ")}`);
  }
}
console.log("");

const requiredMissing = report.capabilities.filter((c) => c.tier === "required" && c.status !== "ready");
process.exit(requiredMissing.length === 0 ? 0 : 1);
