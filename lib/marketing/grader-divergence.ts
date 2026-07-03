import { PASS_SCORE } from "@/lib/marketing/rubrics";
import type { ContentItem } from "@/lib/types";

// P2 — judgment divergence. A human reject on an item Crina PASSED is the single most useful signal
// for improving the honest grader: the grader's taste diverged from the operator's. We tag those in
// feedback_memory so the grader's read-back literally sees "you passed this but it was wrong."

export function crinaScoreOf(item: ContentItem): number | null {
  const pkg = item.ready_package as { crina_score?: unknown } | null;
  if (pkg && typeof pkg.crina_score === "number") return pkg.crina_score;
  const match = (item.crina_review_notes ?? "").match(/(\d{2,3})\s*\/\s*100/);
  return match ? Number(match[1]) : null;
}

export function divergenceReason(item: ContentItem, humanReason: string): { reason: string; diverged: boolean; score: number | null } {
  const score = crinaScoreOf(item);
  if (score != null && score >= PASS_SCORE) {
    return {
      reason: `GRADER MISS — Crina scored ${score}/100 (pass) but the operator rejected it: ${humanReason}. Catch this weakness BEFORE passing next time.`,
      diverged: true,
      score
    };
  }
  return { reason: humanReason, diverged: false, score };
}
