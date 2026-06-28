export type AgentDomain = "Marketing";

export type RegisteredAgent = {
  id: string;
  name: string;
  domain: AgentDomain;
  description: string;
  defaultModel: string;
};

export const registeredAgents: RegisteredAgent[] = [
  { id: "agent-crina", name: "Crina", domain: "Marketing", description: "Marketing CEO Agent.", defaultModel: "gpt-5.5" },
  { id: "agent-seo", name: "SEO Agent", domain: "Marketing", description: "Website, keyword, and search brief logic.", defaultModel: "gpt-5.5" },
  { id: "agent-content-creator", name: "Content Creator Agent", domain: "Marketing", description: "High-value content drafts.", defaultModel: "gpt-5.5" },
  { id: "agent-visual-video", name: "Visual & Video Agent", domain: "Marketing", description: "Carousel, image, and short-video concepts.", defaultModel: "gpt-5.5" },
  { id: "agent-competitor-intelligence", name: "Competitor Intelligence Agent", domain: "Marketing", description: "Social hook discovery and competitor references.", defaultModel: "gpt-5.5" },
  { id: "agent-publishing", name: "Publishing Agent", domain: "Marketing", description: "Draft packaging only. No live posting.", defaultModel: "gpt-5.5" },
  { id: "agent-conversion", name: "Conversion Agent", domain: "Marketing", description: "Estimates funnel conversion and ranks what converts for Crina.", defaultModel: "gpt-5.5" }
];

export function getRegisteredAgent(id: string) {
  return registeredAgents.find((agent) => agent.id === id) ?? null;
}
