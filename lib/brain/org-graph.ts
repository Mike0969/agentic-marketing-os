// Pure builder for the 3D command-center graph. Dependency-injected + no I/O so it is
// unit-testable. Never returns secret values — only labels, types, statuses, hrefs.
//
// Resilience is scoped to DATA-QUERY failure (a source is "unavailable"), not total auth
// outage: the route's auth gate itself depends on Supabase, so if auth is fully down the
// request is denied before this runs — that is expected and out of scope here.

export type NodeType = "os" | "business" | "domain" | "agent";
export type NodeStatus = "active" | "planned" | "success" | "fallback" | "error" | "rate_limited" | "idle";

export interface OrgNode { id: string; label: string; type: NodeType; status: NodeStatus; href: string | null; val: number }
export interface OrgLink { source: string; target: string }
export interface OrgGraph { nodes: OrgNode[]; links: OrgLink[]; generatedAt: string }

// A source is either a successful query (possibly empty) or unavailable/errored.
export type Source<T> = { state: "ok"; data: T[] } | { state: "unavailable" };

export interface Brand { id: string; name: string }
export interface Agent { id: string; name: string }

// Fallback skeletons used ONLY when a source is unavailable (never to paper over a
// legitimately empty tenant, which stays empty — F3).
const KNOWN_BRANDS: Brand[] = [
  { id: "gridfactory", name: "GridFactory.io" },
  { id: "gulf_el_nexride", name: "Gulf-EL.com / NexRide" }
];
const KNOWN_AGENTS: Agent[] = [
  { id: "crina", name: "Crina" },
  { id: "seo", name: "SEO Agent" },
  { id: "content", name: "Content Creator Agent" },
  { id: "visual", name: "Visual & Video Agent" },
  { id: "competitor", name: "Competitor Intelligence Agent" },
  { id: "publishing", name: "Publishing Agent" }
];

// Frozen function-domain map. Mailing's activity depends on Resend being configured.
function domains(mailingActive: boolean): OrgNode[] {
  return [
    { id: "domain:marketing", label: "Marketing", type: "domain", status: "active", href: "/marketing", val: 8 },
    { id: "domain:sales", label: "Sales", type: "domain", status: "active", href: "/sales", val: 8 },
    { id: "domain:mailing", label: "Mailing", type: "domain", status: mailingActive ? "active" : "planned", href: mailingActive ? "/marketing" : null, val: 8 },
    { id: "domain:ads", label: "Ads", type: "domain", status: "planned", href: null, val: 8 },
    { id: "domain:trading", label: "Trading", type: "domain", status: "planned", href: null, val: 8 },
    { id: "domain:investor", label: "Investor platform", type: "domain", status: "planned", href: null, val: 8 },
    { id: "domain:assistant", label: "Personal assistant", type: "domain", status: "planned", href: null, val: 8 },
    { id: "domain:web", label: "Web assistants", type: "domain", status: "planned", href: null, val: 8 }
  ];
}

const VALID_STATUS = new Set<NodeStatus>(["active", "planned", "success", "fallback", "error", "rate_limited", "idle"]);
function normStatus(s: string | null | undefined): NodeStatus {
  return s && VALID_STATUS.has(s as NodeStatus) ? (s as NodeStatus) : "idle";
}

export function buildOrgGraph(input: {
  brands: Source<Brand>;
  agents: Source<Agent>;
  // latest agent_runs.status keyed by agent NAME (agent_id is null in practice — join on name)
  statusByAgentName: Record<string, string>;
  mailingActive: boolean;
}): OrgGraph {
  const brands = input.brands.state === "ok" ? input.brands.data : KNOWN_BRANDS;
  const agents = input.agents.state === "ok" ? input.agents.data : KNOWN_AGENTS;

  const nodes: OrgNode[] = [];
  const seen = new Set<string>();
  const push = (n: OrgNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  push({ id: "os", label: "Command Center", type: "os", status: "active", href: "/", val: 20 });

  const businessIds: string[] = [];
  for (const b of brands) {
    const id = `business:${b.id}`;
    businessIds.push(id);
    push({ id, label: b.name, type: "business", status: "active", href: "/marketing", val: 12 });
  }

  const domainNodes = domains(input.mailingActive);
  for (const d of domainNodes) push(d);

  const agentIds: string[] = [];
  for (const a of agents) {
    const id = `agent:${a.id}`;
    agentIds.push(id);
    push({ id, label: a.name, type: "agent", status: normStatus(input.statusByAgentName[a.name]), href: "/agents", val: 5 });
  }

  // links: os→business, os→domain, business→marketing, marketing→agent. Dedup + only
  // between existing nodes (no dangling endpoints).
  const links: OrgLink[] = [];
  const linkSeen = new Set<string>();
  const link = (source: string, target: string) => {
    if (!seen.has(source) || !seen.has(target)) return;
    const key = `${source}->${target}`;
    if (linkSeen.has(key)) return;
    linkSeen.add(key);
    links.push({ source, target });
  };
  for (const b of businessIds) { link("os", b); link(b, "domain:marketing"); }
  for (const d of domainNodes) link("os", d.id);
  for (const ag of agentIds) link("domain:marketing", ag);

  return { nodes, links, generatedAt: new Date().toISOString() };
}
