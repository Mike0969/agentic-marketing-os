import { existsSync } from "fs";
import { appendFile, readFile, readdir, stat, writeFile } from "fs/promises";
import path from "path";

/**
 * Server-side reader for the Hermes team registry (team.json) and the shared
 * brain resource collection. Agent team metadata still comes from the local
 * Hermes profile when present, but the deployable brain source of truth is the
 * repo-tracked `hermes-brain/` directory. The local Hermes brain is treated as a
 * writable cache for Buddy, not as canonical production memory.
 *
 * Hermes /v1/chat/completions does not natively route to the agent IDs, so the
 * dashboard treats this registry as canonical and injects the relevant metadata
 * + brain context into each call.
 *
 * Safety:
 * - Only ever runs on the server (fs access).
 * - Never returns secrets. team.json holds no credentials; brain files are
 *   policy/markdown notes. We still expose only file names + lightweight
 *   metadata to the client, and inject brain *content* solely into server-side
 *   prompts (never returned to the browser).
 * - Missing files produce a clean empty/error state instead of throwing.
 */

export type HermesAgentProfile = {
  id: string;
  name: string;
  role: string;
  purpose: string;
  allowed_actions: string[];
  blocked_actions: string[];
  default_model: string;
  primary: boolean;
};

export type HermesTeam = {
  collection: string;
  profile: string;
  dashboardProject: string | null;
  sharedBrain: string | null;
  sharedBrainPath: string | null;
  defaultModel: string;
  backupModel: string | null;
  livePostingEnabled: boolean;
  apiTargeting: {
    endpoint: string | null;
    nativeAgentIdRouting: boolean;
    routingMethod: string | null;
  };
  agents: HermesAgentProfile[];
};

export type BrainResource = {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type HermesRegistrySnapshot = {
  available: boolean;
  source: "registry" | "missing";
  teamPath: string;
  brainPath: string | null;
  team: HermesTeam | null;
  brainResources: BrainResource[];
  error: string | null;
};

const DEFAULT_TEAM_PATH = "/Users/dubai/.hermes/profiles/buddy/agents/agentic-marketing-os/team.json";
const REPO_BRAIN_PATH = path.join(process.cwd(), "hermes-brain");
const DEFAULT_LOCAL_BRAIN_PATH = "/Users/dubai/.hermes/profiles/buddy/resources/agentic-marketing-os-brain";

function resolveTeamPath() {
  return process.env.HERMES_TEAM_PATH || DEFAULT_TEAM_PATH;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeAgent(raw: unknown): HermesAgentProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const agent = raw as Record<string, unknown>;
  if (typeof agent.id !== "string" || typeof agent.name !== "string") return null;

  return {
    id: agent.id,
    name: agent.name,
    role: typeof agent.role === "string" ? agent.role : "",
    purpose: typeof agent.purpose === "string" ? agent.purpose : "",
    allowed_actions: asStringArray(agent.allowed_actions),
    blocked_actions: asStringArray(agent.blocked_actions),
    default_model: typeof agent.default_model === "string" ? agent.default_model : "",
    primary: agent.primary === true
  };
}

function normalizeTeam(raw: unknown): HermesTeam | null {
  if (!raw || typeof raw !== "object") return null;
  const team = raw as Record<string, unknown>;
  const agents = Array.isArray(team.agents) ? (team.agents.map(normalizeAgent).filter(Boolean) as HermesAgentProfile[]) : [];

  if (!agents.length) return null;

  const apiTargeting = (team.api_targeting && typeof team.api_targeting === "object" ? team.api_targeting : {}) as Record<string, unknown>;

  return {
    collection: typeof team.collection === "string" ? team.collection : "agentic-marketing-os",
    profile: typeof team.profile === "string" ? team.profile : "buddy",
    dashboardProject: typeof team.dashboard_project === "string" ? team.dashboard_project : null,
    sharedBrain: typeof team.shared_brain === "string" ? team.shared_brain : null,
    sharedBrainPath: typeof team.shared_brain_path === "string" ? team.shared_brain_path : null,
    defaultModel: typeof team.default_model === "string" ? team.default_model : "gpt-5.5",
    backupModel: typeof team.backup_model === "string" ? team.backup_model : null,
    livePostingEnabled: team.live_posting_enabled === true,
    apiTargeting: {
      endpoint: typeof apiTargeting.endpoint === "string" ? apiTargeting.endpoint : null,
      nativeAgentIdRouting: apiTargeting.native_agent_id_routing === true,
      routingMethod: typeof apiTargeting.routing_method === "string" ? apiTargeting.routing_method : null
    },
    agents
  };
}

function resolveBrainPath(team: HermesTeam | null): string | null {
  if (process.env.HERMES_BRAIN_PATH) return process.env.HERMES_BRAIN_PATH;
  if (existsSync(REPO_BRAIN_PATH)) return REPO_BRAIN_PATH;
  return team?.sharedBrainPath ?? null;
}

function resolveWritableBrainPath(team: HermesTeam | null): string | null {
  if (process.env.HERMES_WRITABLE_BRAIN_PATH) return process.env.HERMES_WRITABLE_BRAIN_PATH;
  if (team?.sharedBrainPath) return team.sharedBrainPath;
  if (existsSync(DEFAULT_LOCAL_BRAIN_PATH)) return DEFAULT_LOCAL_BRAIN_PATH;
  if (process.env.ALLOW_REPO_BRAIN_WRITES === "true" && existsSync(REPO_BRAIN_PATH)) return REPO_BRAIN_PATH;
  return null;
}

async function readBrainResources(brainPath: string | null): Promise<BrainResource[]> {
  if (!brainPath) return [];

  try {
    const entries = await readdir(brainPath, { withFileTypes: true });
    const resources = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map(async (entry) => {
          const fullPath = path.join(brainPath, entry.name);
          const info = await stat(fullPath);
          return {
            name: entry.name,
            sizeBytes: info.size,
            modifiedAt: info.mtime.toISOString()
          } satisfies BrainResource;
        })
    );

    return resources.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Read the full registry snapshot for display. Never throws.
 */
export async function readHermesRegistry(): Promise<HermesRegistrySnapshot> {
  const teamPath = resolveTeamPath();

  let team: HermesTeam | null = null;
  let error: string | null = null;

  try {
    const raw = await readFile(teamPath, "utf8");
    team = normalizeTeam(JSON.parse(raw));
    if (!team) {
      error = "team.json was found but did not contain a valid agent registry.";
    }
  } catch (cause) {
    error = cause instanceof Error ? `Could not read team.json (${cause.message}).` : "Could not read team.json.";
  }

  const brainPath = resolveBrainPath(team);
  const brainResources = await readBrainResources(brainPath);

  return {
    available: Boolean(team),
    source: team ? "registry" : "missing",
    teamPath,
    brainPath,
    team,
    brainResources,
    error
  };
}

/**
 * Look up a single agent profile by id. Returns null if the registry is
 * unavailable or the agent is not registered.
 */
export async function getHermesAgentProfile(agentId: string): Promise<HermesAgentProfile | null> {
  const snapshot = await readHermesRegistry();
  return snapshot.team?.agents.find((agent) => agent.id === agentId) ?? null;
}

const MAX_BRAIN_CONTEXT_CHARS = 12000;

export type BrainContext = {
  text: string;
  resourcesUsed: string[];
};

/**
 * Build a compact, server-only brain context string for prompt injection.
 *
 * `only` optionally restricts which brain files are read (by file name) so an
 * agent can pull just the resources relevant to its role. Content is truncated
 * to a budget and is NEVER returned to the client — only used inside prompts.
 */
export async function buildBrainContext(only?: string[]): Promise<BrainContext> {
  const snapshot = await readHermesRegistry();
  if (!snapshot.brainPath || !snapshot.brainResources.length) {
    return { text: "", resourcesUsed: [] };
  }

  const wanted = only && only.length ? snapshot.brainResources.filter((resource) => only.includes(resource.name)) : snapshot.brainResources;

  const chunks: string[] = [];
  const resourcesUsed: string[] = [];
  let budget = MAX_BRAIN_CONTEXT_CHARS;

  for (const resource of wanted) {
    if (budget <= 0) break;
    try {
      const content = await readFile(path.join(snapshot.brainPath, resource.name), "utf8");
      const slice = content.slice(0, budget).trim();
      if (!slice) continue;
      chunks.push(`# ${resource.name}\n${slice}`);
      resourcesUsed.push(resource.name);
      budget -= slice.length;
    } catch {
      // Skip unreadable files; missing brain context must never break a run.
    }
  }

  return { text: chunks.join("\n\n"), resourcesUsed };
}

/** Per-agent memory file name in the shared brain dir, e.g. agent-seo-memory.md */
export function agentMemoryFileName(agentId: string) {
  const safe = agentId.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `${safe}-memory.md`;
}

/** Read an agent's own memory file. Returns "" if missing. Never throws. */
export async function readAgentMemory(agentId: string): Promise<string> {
  const snapshot = await readHermesRegistry();
  if (!snapshot.brainPath) return "";
  try {
    return await readFile(path.join(snapshot.brainPath, agentMemoryFileName(agentId)), "utf8");
  } catch {
    return "";
  }
}

/** Write an agent's own memory file into the shared brain dir. */
export async function writeAgentMemory(agentId: string, content: string): Promise<boolean> {
  const snapshot = await readHermesRegistry();
  const brainPath = resolveWritableBrainPath(snapshot.team);
  if (!brainPath) return false;
  try {
    await writeFile(path.join(brainPath, agentMemoryFileName(agentId)), content, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Append a concise note into a shared brain markdown file. Best-effort only. */
export async function appendBrainResource(fileName: string, content: string): Promise<boolean> {
  const snapshot = await readHermesRegistry();
  const brainPath = resolveWritableBrainPath(snapshot.team);
  if (!brainPath || !fileName.endsWith(".md")) return false;
  try {
    await appendFile(path.join(brainPath, fileName), `\n\n${content.trim()}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}
