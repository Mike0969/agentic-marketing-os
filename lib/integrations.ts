import type { IntegrationConfig, IntegrationProvider, IntegrationStatus } from "@/lib/types";

export const integrationProviders: Array<{
  provider: IntegrationProvider;
  displayName: string;
  category: "Agent Models" | "Automation" | "Social" | "Analytics";
  description: string;
  secretLabel: string;
  recommended?: boolean;
}> = [
  { provider: "openai", displayName: "OpenAI", category: "Agent Models", description: "Prepared model adapter for future specialist agents.", secretLabel: "API key" },
  { provider: "anthropic", displayName: "Anthropic", category: "Agent Models", description: "Prepared Claude adapter for editorial and strategy work.", secretLabel: "API key" },
  { provider: "deepseek", displayName: "DeepSeek", category: "Agent Models", description: "Prepared research and reasoning adapter.", secretLabel: "API key" },
  { provider: "hermes", displayName: "Hermes", category: "Agent Models", description: "Primary agent runtime for Crina and future orchestration.", secretLabel: "Endpoint token" },
  { provider: "n8n", displayName: "n8n", category: "Automation", description: "Webhook automation layer for approvals, notifications, and handoffs.", secretLabel: "Webhook secret" },
  { provider: "telegram", displayName: "Telegram", category: "Automation", description: "Approval and operations notifications.", secretLabel: "Bot token" },
  { provider: "linkedin", displayName: "LinkedIn", category: "Social", description: "Company page read/connect scaffold. No live posting yet.", secretLabel: "Access token" },
  { provider: "x", displayName: "X", category: "Social", description: "Social read/connect scaffold. No live posting yet.", secretLabel: "Bearer token" },
  { provider: "tiktok", displayName: "TikTok", category: "Social", description: "TikTok read/connect scaffold for future short-form analytics.", secretLabel: "Access token" },
  { provider: "youtube", displayName: "YouTube", category: "Social", description: "YouTube read/connect scaffold for future video publishing prep and analytics. No live posting yet.", secretLabel: "OAuth client / API key" },
  { provider: "instagram", displayName: "Instagram", category: "Social", description: "Instagram read/connect scaffold. No live posting yet.", secretLabel: "Access token" },
  { provider: "facebook", displayName: "Facebook", category: "Social", description: "Facebook page read/connect scaffold. No live posting yet.", secretLabel: "Access token" },
  {
    provider: "google-search-console",
    displayName: "Google Search Console",
    category: "Analytics",
    description:
      "Recommended first analytics connector — read-only Search performance (clicks, impressions, CTR, position), one per brand (GridFactory.io and Gulf-EL.com). Durable auth via a service account (added as a user on each property) that self-mints tokens; static tokens supported for quick tests. Per-brand sites via GOOGLE_SEARCH_CONSOLE_SITE_GRIDFACTORY / _GULF_EL. Server-side only, no write scopes, no posting.",
    secretLabel: "Service account (read-only)",
    recommended: true
  }
];

export function normalizeProvider(provider: string): IntegrationProvider | null {
  const match = integrationProviders.find((item) => item.provider === provider);
  return match?.provider ?? null;
}

export function getIntegrationDisplayName(provider: IntegrationProvider) {
  return integrationProviders.find((item) => item.provider === provider)?.displayName ?? provider;
}

export function mergeIntegrationDefaults(configs: IntegrationConfig[]) {
  const byProvider = new Map(configs.map((config) => [config.provider, config]));

  return integrationProviders.map((item) => {
    const existing = byProvider.get(item.provider);
    return (
      existing ?? {
        id: `integration-${item.provider}`,
        provider: item.provider,
        display_name: item.displayName,
        status: "not_configured" as IntegrationStatus,
        metadata: {},
        configured: false,
        last_checked_at: null
      }
    );
  });
}
