"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle2, Plus, Wand2 } from "lucide-react";
import { Badge, buttonClass, inputClass, Panel } from "@/components/ui";
import type {
  GeneratedContentPlanItem,
  WeeklyContentIntensity,
  WeeklyContentPlanBrandSelection,
  WeeklyContentPlanInput,
  WeeklyContentPlanOutput,
  WeeklyContentPlatform
} from "@/lib/types";

const platforms: WeeklyContentPlatform[] = ["LinkedIn", "X", "Instagram", "Facebook", "Blog"];

export function WeeklyContentPlanWorkflow() {
  const router = useRouter();
  const [input, setInput] = useState<WeeklyContentPlanInput>({
    brand: "both",
    campaignObjective: "",
    targetAudience: "",
    weekStartDate: new Date().toISOString().slice(0, 10),
    platforms,
    contentIntensity: "normal",
    humanNotes: ""
  });
  const [plan, setPlan] = useState<WeeklyContentPlanOutput | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const [executionMode, setExecutionMode] = useState<string>("deterministic fallback");
  const [error, setError] = useState<string | null>(null);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, GeneratedContentPlanItem[]>();
    plan?.items.forEach((item) => {
      const key = item.brandName;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return Array.from(groups.entries());
  }, [plan]);

  async function generatePlan() {
    setError(null);
    setCreatedCount(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/workflows/weekly-content-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });

      if (!response.ok) throw new Error("Could not generate the weekly plan.");

      setExecutionMode(response.headers.get("x-agent-fallback") === "true" ? "deterministic fallback" : response.headers.get("x-agent-provider") ?? "agent runtime");
      setPlan((await response.json()) as WeeklyContentPlanOutput);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate the weekly plan.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function createContentItems() {
    if (!plan) return;

    setError(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/content-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: plan.items })
      });

      if (!response.ok) throw new Error("Could not create content items.");

      const result = (await response.json()) as { created: number };
      setCreatedCount(result.created);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create content items.");
    } finally {
      setIsCreating(false);
    }
  }

  function updatePlatform(platform: WeeklyContentPlatform) {
    const nextPlatforms = input.platforms.includes(platform)
      ? input.platforms.filter((item) => item !== platform)
      : [...input.platforms, platform];

    setInput({ ...input, platforms: nextPlatforms });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Panel>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-command" />
          <h2 className="text-lg font-semibold">Crina Brief</h2>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Brand
            <select
              className={`${inputClass} mt-2`}
              value={input.brand}
              onChange={(event) => setInput({ ...input, brand: event.target.value as WeeklyContentPlanBrandSelection })}
            >
              <option value="gridfactory">GridFactory</option>
              <option value="gulf-el">Gulf-EL / NexRide</option>
              <option value="both">Both</option>
            </select>
          </label>

          <label className="block text-sm font-medium">
            Campaign objective
            <textarea
              className={`${inputClass} mt-2 min-h-24`}
              value={input.campaignObjective}
              onChange={(event) => setInput({ ...input, campaignObjective: event.target.value })}
              placeholder="Define the commercial or narrative objective for the week."
            />
          </label>

          <label className="block text-sm font-medium">
            Target audience
            <textarea
              className={`${inputClass} mt-2 min-h-20`}
              value={input.targetAudience}
              onChange={(event) => setInput({ ...input, targetAudience: event.target.value })}
              placeholder="Investors, riders, EV drivers, fleet partners..."
            />
          </label>

          <label className="block text-sm font-medium">
            Week start date
            <input
              type="date"
              className={`${inputClass} mt-2`}
              value={input.weekStartDate}
              onChange={(event) => setInput({ ...input, weekStartDate: event.target.value })}
            />
          </label>

          <div>
            <div className="text-sm font-medium">Platforms</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {platforms.map((platform) => (
                <label key={platform} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={input.platforms.includes(platform)}
                    onChange={() => updatePlatform(platform)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {platform}
                </label>
              ))}
            </div>
          </div>

          <label className="block text-sm font-medium">
            Content intensity
            <select
              className={`${inputClass} mt-2`}
              value={input.contentIntensity}
              onChange={(event) => setInput({ ...input, contentIntensity: event.target.value as WeeklyContentIntensity })}
            >
              <option value="light">Light</option>
              <option value="normal">Normal</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </label>

          <label className="block text-sm font-medium">
            Human notes
            <textarea
              className={`${inputClass} mt-2 min-h-24`}
              value={input.humanNotes}
              onChange={(event) => setInput({ ...input, humanNotes: event.target.value })}
              placeholder="Add constraints, angles, offers, or competitor context for Crina."
            />
          </label>

          {error ? <div className="rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</div> : null}

          <button type="button" className={buttonClass} onClick={generatePlan} disabled={isGenerating || input.platforms.length === 0}>
            <Wand2 className="mr-2 h-4 w-4" />
            {isGenerating ? "Generating..." : "Generate Plan"}
          </button>
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg font-semibold">Generated Weekly Content Plan</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Crina creates ideas and briefs only. Nothing is scheduled or published automatically.
              </p>
              <div className="mt-2">
                <Badge tone={executionMode.includes("fallback") ? "amber" : "green"}>{executionMode}</Badge>
              </div>
            </div>
            <button type="button" className={buttonClass} onClick={createContentItems} disabled={!plan || isCreating}>
              <Plus className="mr-2 h-4 w-4" />
              {isCreating ? "Creating..." : "Create Content Items"}
            </button>
          </div>
          {plan ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {plan.summary}
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
              Fill in the brief and generate the first agent-created weekly plan.
            </div>
          )}
          {createdCount !== null ? (
            <div className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              {createdCount} content items were created in the pipeline.
            </div>
          ) : null}
        </Panel>

        {groupedItems.map(([brandName, items]) => (
          <Panel key={brandName}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">{brandName}</h3>
              <Badge tone="blue">{items.length} items</Badge>
            </div>
            <div className="grid gap-3">
              {items.map((item) => (
                <article key={item.id} className="rounded-md border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={item.status === "brief" ? "amber" : "neutral"}>{item.status}</Badge>
                        <Badge tone="blue">{item.platform}</Badge>
                      </div>
                      <h4 className="mt-3 font-semibold">{item.title}</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.body}</p>
                    </div>
                    <div className="min-w-44 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Agent</div>
                      <div className="mt-1 font-medium">{item.assigned_agent}</div>
                      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">CTA</div>
                      <div className="mt-1">{item.CTA}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
