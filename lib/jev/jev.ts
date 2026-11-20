import { TypeSafeClient, noul } from "@typesafe-ai/sdk";
import { chargeModelCall } from "@/lib/budget/model-budget";
import type { Brand } from "@/lib/types";

/**
 * Jev (TypeSafe System One) checks Crina's plan and each agent's output before
 * it reaches the admin: atomic yes/no questions scored 0..1 against his brand rules
 * and the learning notes. The score is the lowest answer; below 0.85 the item
 * goes back for automatic rework (max 2 rounds), then to the admin marked
 * "Jev doubts: …". Same bar as tools/jev/jev-gate.mjs in nexride-hq.
 */

export const JEV_PASS = 0.85;
export const JEV_MAX_REWORKS = 2;

export type JevKind = "plan" | "text" | "visual";

type Question = { key: string; text: string; yes: string; no: string };

const COMMON: Question[] = [
  {
    key: "brand_rules",
    text: "Does this follow the brand rules given (positioning, tone of voice, approval rules, never-do list)?",
    yes: "Consistent with every stated brand rule; nothing the rules forbid",
    no: "Breaks or ignores at least one stated brand rule"
  },
  {
    key: "no_repeat",
    text: "Does this avoid repeating anything the owner already rejected in the learning notes?",
    yes: "None of the rejected items or reasons in the learning notes apply to it",
    no: "It repeats a rejected item, or has the problem a rejection reason names"
  },
  {
    key: "no_invented",
    text: "Is it free of invented numbers, results or claims not supported by the brand material given?",
    yes: "Every number and factual claim comes from the brand material or the owner's idea",
    no: "It states a number, result or claim that the given material does not support"
  }
];

const BY_KIND: Record<JevKind, Question[]> = {
  plan: [
    {
      key: "owner_idea",
      text: "Does this campaign plan deliver the owner's idea as he wrote it, without changing its point?",
      yes: "The plan's goal, audience and message trace directly to the owner's idea",
      no: "The plan drifts from, adds to, or loses the owner's idea"
    },
    {
      key: "agent_tasks",
      text: "Does the plan give each working agent (content, visual, SEO, analytics) one concrete task?",
      yes: "Every agent has a concrete, checkable task",
      no: "At least one agent's task is missing or vague"
    }
  ],
  text: [
    {
      key: "owner_idea",
      text: "Does this post deliver the campaign plan and the owner's idea?",
      yes: "The post's message is the plan's key message for this platform",
      no: "The post drifts from the plan or the owner's idea"
    },
    {
      key: "platform_fit",
      text: "Is this post ready for its platform: clear hook, one clear call to action, right length and format?",
      yes: "Hook, single CTA, length and format fit the platform",
      no: "Weak or missing hook or CTA, or wrong length or format for the platform"
    }
  ],
  visual: [
    {
      key: "owner_idea",
      text: "Does this visual concept support the post and the campaign plan?",
      yes: "The visual shows the post's message in a way the plan calls for",
      no: "The visual is generic or unrelated to the post or plan"
    },
    {
      key: "safe_visual",
      text: "Is the visual concept free of fake logos, readable invented text, misleading scenes and sci-fi fantasy the brand rules exclude?",
      yes: "Credible, brand-safe scene with none of those problems",
      no: "Has a fake logo, invented readable text, a misleading scene, or excluded styling"
    }
  ]
};

export function jevQuestions(kind: JevKind) {
  return [...BY_KIND[kind], ...COMMON];
}

export type JevResult = {
  ran: boolean;
  score: number | null;
  pass: boolean;
  /** Failing questions in plain words, for rework instructions and "Jev doubts: …". */
  doubts: string[];
  answers: Record<string, number>;
  note: string | null;
  model: string | null;
};

export type JevClient = { systemOne: (request: { state: string; questions: Record<string, unknown> }) => Promise<{ answers: Record<string, { noul?: number } | undefined>; model?: string }> };

function brandRules(brand: Partial<Brand> | null | undefined) {
  if (!brand) return "No brand profile.";
  const lines: Array<[string, unknown]> = [
    ["Brand", brand.name],
    ["Positioning", brand.positioning],
    ["Target audience", brand.target_audience],
    ["Tone of voice", brand.tone_of_voice],
    ["Key messages", brand.key_messages],
    ["Proof points", brand.proof_points],
    ["Offers", brand.offers],
    ["Approval rules", brand.approval_rules]
  ];
  return lines.filter(([, value]) => typeof value === "string" && value.trim()).map(([label, value]) => `${label}: ${value}`).join("\n");
}

export function jevState(args: { kind: JevKind; idea: string; brand: Partial<Brand> | null | undefined; learning: string; subject: unknown; plan?: unknown }) {
  return [
    `Item to check: ${args.kind === "plan" ? "Crina's campaign plan" : args.kind === "text" ? "a social post (text)" : "a visual concept for a social post"}.`,
    `Owner's idea (in the owner's own words): ${args.idea || "(none given)"}`,
    `Brand rules:\n${brandRules(args.brand)}`,
    args.plan ? `Campaign plan:\n${JSON.stringify(args.plan)}` : "",
    args.learning,
    `The item:\n${typeof args.subject === "string" ? args.subject : JSON.stringify(args.subject, null, 1)}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

let defaultClient: JevClient | null = null;
function getClient(): JevClient | null {
  if (!process.env.TYPESAFE_API_KEY) return null;
  defaultClient ??= new TypeSafeClient() as unknown as JevClient; // reads TYPESAFE_API_KEY; never logged
  return defaultClient;
}

/** One Jev check. Never throws: without a key or on an API error, ran=false and the item is not blocked. */
export async function jevCheck(
  args: { kind: JevKind; idea: string; brand: Partial<Brand> | null | undefined; learning: string; subject: unknown; plan?: unknown },
  client: JevClient | null = getClient()
): Promise<JevResult> {
  if (!client) return { ran: false, score: null, pass: true, doubts: [], answers: {}, note: "Jev not run: TYPESAFE_API_KEY missing.", model: null };
  const questions = jevQuestions(args.kind);
  const refused = await chargeModelCall("jev", `jev:${args.kind}`);
  if (refused) return { ran: false, score: null, pass: true, doubts: [], answers: {}, note: `Jev not run: ${refused}`, model: null };
  try {
    const res = await client.systemOne({
      state: jevState(args),
      questions: Object.fromEntries(questions.map((q) => [q.key, noul(q.text, { true: q.yes, false: q.no })]))
    });
    const answers: Record<string, number> = {};
    for (const q of questions) {
      const value = res.answers[q.key]?.noul;
      answers[q.key] = Number.isFinite(value) && (value as number) >= 0 && (value as number) <= 1 ? (value as number) : 0;
    }
    const score = Math.min(...Object.values(answers));
    const doubts = questions.filter((q) => answers[q.key] < JEV_PASS).map((q) => `${q.no} (${answers[q.key].toFixed(2)})`);
    return { ran: true, score, pass: score >= JEV_PASS, doubts, answers, note: null, model: res.model ?? null };
  } catch (error) {
    return { ran: false, score: null, pass: true, doubts: [], answers: {}, note: `Jev not run: ${error instanceof Error ? error.message.slice(0, 120) : "API error"}.`, model: null };
  }
}

/**
 * Check, and on a fail ask `rework` for a new version with Jev's doubts, at most
 * JEV_MAX_REWORKS times. Returns the last version and its last check; a version
 * that still fails carries "Jev doubts: …" for the admin.
 */
export async function jevLoop<T>(
  first: T,
  check: (candidate: T) => Promise<JevResult>,
  rework: (candidate: T, doubts: string[]) => Promise<T | null>,
  maxReworks = JEV_MAX_REWORKS
): Promise<{ candidate: T; result: JevResult; reworks: number; doubtsLabel: string | null }> {
  let candidate = first;
  let result = await check(candidate);
  let reworks = 0;
  while (result.ran && !result.pass && reworks < maxReworks) {
    const next = await rework(candidate, result.doubts);
    reworks += 1;
    if (!next) break;
    candidate = next;
    result = await check(candidate);
  }
  const doubtsLabel = result.ran && !result.pass ? `Jev doubts: ${result.doubts.join("; ")}` : null;
  return { candidate, result, reworks, doubtsLabel };
}
