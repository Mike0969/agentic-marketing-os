import { Badge } from "@/components/ui";
import type { ApprovalStatus, CampaignStatus, ContentStatus } from "@/lib/types";

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const tone = status === "published" || status === "analyzed" ? "green" : status === "approval" ? "amber" : "blue";
  return <Badge tone={tone}>{status}</Badge>;
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const tone =
    status === "approved" ? "green" : status === "pending" || status === "changes_requested" ? "amber" : status === "rejected" ? "red" : "neutral";
  return <Badge tone={tone}>{status.replaceAll("_", " ")}</Badge>;
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const tone = status === "active" ? "green" : status === "planning" ? "blue" : status === "paused" ? "amber" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}
