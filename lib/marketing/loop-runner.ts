import { randomUUID } from "node:crypto";
import { MAX_ROUNDS, PASS_SCORE } from "@/lib/marketing/rubrics";

// Generic bounded, scored judge loop (CEO loop spec). A maker proposes one candidate per round;
// Crina judges it with a rubric; we keep the highest-scoring candidate (champion) and only replace
// it when a rework scores strictly higher. Stops on: pass (>=passScore) · max rounds · no score gain
// for 2 rounds · safety gate · maker error. Writes one receipt per round via recordReceipt.

export type LoopStopReason = "pass" | "max_rounds" | "no_progress" | "safety" | "error" | "needs_human";
export type LoopDecision = "pass" | "rework" | "fail" | "needs_human";

export type MakeResult<T> = {
  candidate: T | null; // null => maker failed this round
  outputSummary: string;
  provider: string;
  model: string | null;
  fallbackUsed: boolean;
  tokensPrompt: number | null;
  tokensCompletion: number | null;
  tokensTotal: number | null;
  latencyMs: number;
};

export type JudgeResult = {
  score: number; // 0-100
  safetyPass: boolean;
  judgeNotes: string;
  improvements: string[];
  fallbackUsed: boolean; // the judge model itself fell back
  tokensTotal: number | null;
  latencyMs: number;
};

export type LoopReceipt = {
  loopId: string;
  loopType: string;
  agentId: string;
  roundNumber: number;
  inputSummary: string;
  outputSummary: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  judgeNotes: string;
  decision: LoopDecision;
  stopReason: LoopStopReason | null;
  fallbackUsed: boolean;
  provider: string;
  model: string | null;
  tokensPrompt: number | null;
  tokensCompletion: number | null;
  tokensTotal: number | null;
  latencyMs: number;
};

export type LoopResult<T> = {
  loopId: string;
  champion: T | null;
  championScore: number;
  rounds: number;
  stopReason: LoopStopReason;
  passed: boolean;
  lastJudgeNotes: string;
  fallbackUsed: boolean;
  provider: string;
  model: string | null;
};

export type RunJudgedLoopArgs<T> = {
  loopType: string;
  agentId: string; // the maker agent id
  inputSummary: string;
  maxRounds?: number;
  passScore?: number;
  make: (round: number, improvements: string[], champion: T | null) => Promise<MakeResult<T>>;
  judge: (candidate: T, round: number) => Promise<JudgeResult>;
  recordReceipt: (receipt: LoopReceipt) => Promise<void>;
};

function sumTokens(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function receiptBase<T>(
  args: RunJudgedLoopArgs<T>,
  loopId: string,
  round: number,
  made: MakeResult<T>,
  scoreBefore: number | null,
  scoreAfter: number | null,
  judgeNotes: string,
  decision: LoopDecision,
  stopReason: LoopStopReason | null
): LoopReceipt {
  return {
    loopId,
    loopType: args.loopType,
    agentId: args.agentId,
    roundNumber: round,
    inputSummary: args.inputSummary,
    outputSummary: made.outputSummary,
    scoreBefore,
    scoreAfter,
    judgeNotes,
    decision,
    stopReason,
    fallbackUsed: made.fallbackUsed,
    provider: made.provider,
    model: made.model,
    tokensPrompt: made.tokensPrompt,
    tokensCompletion: made.tokensCompletion,
    tokensTotal: made.tokensTotal,
    latencyMs: made.latencyMs
  };
}

async function safeReceipt(record: (r: LoopReceipt) => Promise<void>, receipt: LoopReceipt) {
  try {
    await record(receipt);
  } catch {
    // receipts are best-effort; never break the loop on a logging failure
  }
}

export async function runJudgedLoop<T>(args: RunJudgedLoopArgs<T>): Promise<LoopResult<T>> {
  const maxRounds = Math.max(1, args.maxRounds ?? MAX_ROUNDS);
  const passScore = args.passScore ?? PASS_SCORE;
  const loopId = randomUUID();

  let champion: T | null = null;
  let championScore = -1;
  let improvements: string[] = [];
  let noImprove = 0;
  let stopReason: LoopStopReason = "max_rounds";
  let lastJudgeNotes = "";
  let anyFallback = false;
  let provider = "";
  let model: string | null = null;
  let roundsRun = 0;

  for (let round = 0; round < maxRounds; round += 1) {
    roundsRun = round + 1;
    const made = await args.make(round, improvements, champion);
    provider = made.provider;
    model = made.model;
    if (made.fallbackUsed) anyFallback = true;
    const scoreBefore = championScore < 0 ? null : championScore;

    if (!made.candidate) {
      stopReason = "error";
      await safeReceipt(args.recordReceipt, receiptBase(args, loopId, round, made, scoreBefore, 0, "maker produced no candidate", "fail", "error"));
      break;
    }

    const judged = await args.judge(made.candidate, round);
    lastJudgeNotes = judged.judgeNotes;
    if (judged.fallbackUsed) anyFallback = true;

    if (!judged.safetyPass) {
      stopReason = "safety";
      await safeReceipt(args.recordReceipt, {
        ...receiptBase(args, loopId, round, made, scoreBefore, judged.score, judged.judgeNotes, "fail", "safety"),
        tokensTotal: sumTokens(made.tokensTotal, judged.tokensTotal),
        latencyMs: made.latencyMs + judged.latencyMs
      });
      break;
    }

    if (judged.score > championScore) {
      champion = made.candidate;
      championScore = judged.score;
      noImprove = 0;
    } else {
      noImprove += 1;
    }
    improvements = judged.improvements;

    const decision: LoopDecision = judged.score >= passScore ? "pass" : "rework";
    let terminal: LoopStopReason | null = null;
    if (judged.score >= passScore) terminal = "pass";
    else if (round === maxRounds - 1) terminal = "max_rounds";
    else if (noImprove >= 2) terminal = "no_progress";

    await safeReceipt(args.recordReceipt, {
      ...receiptBase(args, loopId, round, made, scoreBefore, judged.score, judged.judgeNotes, decision, terminal),
      tokensTotal: sumTokens(made.tokensTotal, judged.tokensTotal),
      latencyMs: made.latencyMs + judged.latencyMs
    });

    if (terminal) {
      stopReason = terminal;
      break;
    }
  }

  return {
    loopId,
    champion,
    championScore: championScore < 0 ? 0 : championScore,
    rounds: roundsRun,
    stopReason,
    passed: stopReason === "pass",
    lastJudgeNotes,
    fallbackUsed: anyFallback,
    provider,
    model
  };
}
