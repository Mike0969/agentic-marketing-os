import OpenAI from "openai";
import { randomUUID } from "crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { beginModelCall, finishModelCall } from "@/lib/budget/model-budget";

export type ImageGenerationResult = {
  ok: boolean;
  url: string | null;
  bytes: Buffer | null;
  provider: "hermes" | "gpt-image" | "flux" | "stability" | "placeholder";
  model: string;
  fallbackUsed: boolean;
  status: "generated" | "placeholder" | "error";
  error: string | null;
  durationMs: number;
};

export type ImageAspect = "square" | "landscape" | "vertical" | "auto";
export type ImageSize = "1024x1024" | "1536x1024" | "1024x1536" | "auto";
export type ImageQuality = "low" | "medium" | "high" | "auto";

type ImageGenerationOptions = {
  aspect?: ImageAspect;
  size?: ImageSize;
  quality?: ImageQuality;
};

function imageModel() {
  const configured = process.env.OPENAI_IMAGE_MODEL?.trim();
  return configured && /^gpt-image-\d+$/i.test(configured) ? configured : "gpt-image-1";
}

function imageQuality(): ImageQuality {
  const configured = process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
  return configured === "low" || configured === "medium" || configured === "high" || configured === "auto" ? configured : "high";
}

const GPT_IMAGE_MODEL = imageModel();
const GPT_IMAGE_QUALITY = imageQuality();
const FLUX_MODEL = process.env.FLUX_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
const STABILITY_MODEL = process.env.STABILITY_IMAGE_MODEL || "stabilityai/stable-diffusion-xl-base-1.0";

function sizeForAspect(options: ImageGenerationOptions = {}): ImageSize {
  if (options.size) return options.size;
  if (options.aspect === "landscape") return "1536x1024";
  if (options.aspect === "vertical") return "1024x1536";
  return "1024x1024";
}

function aspectInstruction(options: ImageGenerationOptions = {}) {
  const aspect = options.aspect ?? "square";
  if (aspect === "landscape") return "Landscape 3:2 composition for LinkedIn/X feeds.";
  if (aspect === "vertical") return "Vertical 2:3 composition for short-video/story cover use.";
  if (aspect === "auto") return "Use the most natural aspect ratio for the platform brief.";
  return "Square 1:1 composition for carousel/feed use.";
}

function strengthenPrompt(prompt: string, options: ImageGenerationOptions = {}) {
  return [
    "Create a premium brand-safe marketing visual for a serious commercial campaign.",
    "Photorealistic or high-end editorial realism unless the brief explicitly asks otherwise.",
    "High detail, polished commercial art direction, crisp subject, realistic lighting, strong composition, real materials, real scale, no generic stock-photo feel.",
    "Avoid flat 2D illustration, cartoon AI motifs, neon sci-fi cliches, fake dashboards, fake logos, bland abstract gradients, and empty decorative scenes.",
    "No readable text, no captions, no UI screenshots, no watermarks, no fake logos, no real-person likeness unless explicitly provided.",
    aspectInstruction(options),
    "The image must support the campaign concept without relying on embedded words.",
    `Brief: ${prompt}`
  ].join("\n");
}

function dataUrlToBuffer(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",");
  return Buffer.from(base64 || dataUrl, "base64");
}

async function generateGptImage(prompt: string, options: ImageGenerationOptions = {}): Promise<ImageGenerationResult> {
  const started = Date.now();
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, url: null, bytes: null, provider: "gpt-image", model: GPT_IMAGE_MODEL, fallbackUsed: false, status: "error", error: "OPENAI_API_KEY is not configured.", durationMs: Date.now() - started };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.images.generate({
      model: GPT_IMAGE_MODEL,
      prompt: strengthenPrompt(prompt, options),
      size: sizeForAspect(options),
      quality: options.quality ?? GPT_IMAGE_QUALITY
    } as never);
    const image = response.data?.[0] as { b64_json?: string; url?: string } | undefined;
    const bytes = image?.b64_json ? Buffer.from(image.b64_json, "base64") : image?.url ? await fetchBytes(image.url) : null;
    if (!bytes) throw new Error("GPT Image returned no image data.");
    return { ok: true, url: null, bytes, provider: "gpt-image", model: GPT_IMAGE_MODEL, fallbackUsed: false, status: "generated", error: null, durationMs: Date.now() - started };
  } catch (error) {
    return { ok: false, url: null, bytes: null, provider: "gpt-image", model: GPT_IMAGE_MODEL, fallbackUsed: false, status: "error", error: error instanceof Error ? error.message : "GPT Image failed.", durationMs: Date.now() - started };
  }
}

async function fetchBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function generateHuggingFace(prompt: string, provider: "flux" | "stability", model: string, options: ImageGenerationOptions = {}): Promise<ImageGenerationResult> {
  const started = Date.now();
  if (!process.env.HUGGINGFACE_API_KEY) {
    return { ok: false, url: null, bytes: null, provider, model, fallbackUsed: true, status: "error", error: "HUGGINGFACE_API_KEY is not configured.", durationMs: Date.now() - started };
  }

  try {
    const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: strengthenPrompt(prompt, options) })
    });
    if (!response.ok) throw new Error(`Hugging Face ${provider} failed: ${response.status} ${await response.text()}`);
    return { ok: true, url: null, bytes: Buffer.from(await response.arrayBuffer()), provider, model, fallbackUsed: true, status: "generated", error: null, durationMs: Date.now() - started };
  } catch (error) {
    return { ok: false, url: null, bytes: null, provider, model, fallbackUsed: true, status: "error", error: error instanceof Error ? error.message : `${provider} failed.`, durationMs: Date.now() - started };
  }
}

async function generateReplicate(prompt: string, provider: "flux" | "stability", model: string, options: ImageGenerationOptions = {}): Promise<ImageGenerationResult> {
  const started = Date.now();
  if (!process.env.REPLICATE_API_TOKEN) {
    return { ok: false, url: null, bytes: null, provider, model, fallbackUsed: true, status: "error", error: "REPLICATE_API_TOKEN is not configured.", durationMs: Date.now() - started };
  }

  try {
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait"
      },
      body: JSON.stringify({ version: model, input: { prompt: strengthenPrompt(prompt, options) } })
    });
    if (!response.ok) throw new Error(`Replicate ${provider} failed: ${response.status} ${await response.text()}`);
    const payload = (await response.json()) as { output?: string[] | string };
    const output = Array.isArray(payload.output) ? payload.output[0] : payload.output;
    if (!output) throw new Error("Replicate returned no image URL.");
    return { ok: true, url: null, bytes: await fetchBytes(output), provider, model, fallbackUsed: true, status: "generated", error: null, durationMs: Date.now() - started };
  } catch (error) {
    return { ok: false, url: null, bytes: null, provider, model, fallbackUsed: true, status: "error", error: error instanceof Error ? error.message : `${provider} failed.`, durationMs: Date.now() - started };
  }
}

/** Where Hermes keeps generated images (each profile: <home>/cache/generated/images/). Files are read only from here. */
const HERMES_HOME = process.env.HERMES_HOME_DIR || "/home/ubuntu/.hermes";

/** Pure: the image path Hermes returned, if it is a png/jpg/webp file inside Hermes's home (no traversal). */
export function safeHermesImagePath(candidate: unknown, home = HERMES_HOME): string | null {
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  const resolved = path.resolve(candidate.trim().replace(/^file:\/\//, ""));
  const root = path.resolve(home) + path.sep;
  if (!resolved.startsWith(root)) return null;
  return /\.(png|jpe?g|webp)$/i.test(resolved) ? resolved : null;
}

/**
 * Image through Hermes (admin 2026-11-20): the crina profile's image tool on the ChatGPT plan
 * (openai-codex, gpt-image-2-medium; $0 per image, counts against the plan). Hermes saves the file
 * locally and returns its path; we read it only from Hermes's home. Never throws.
 */
async function generateHermesImage(prompt: string, options: ImageGenerationOptions = {}): Promise<ImageGenerationResult> {
  const started = Date.now();
  const endpoint = process.env.HERMES_AGENT_ENDPOINT;
  const token = process.env.HERMES_AGENT_TOKEN;
  const fail = (error: string, model = "crina"): ImageGenerationResult => ({ ok: false, url: null, bytes: null, provider: "hermes", model, fallbackUsed: true, status: "error", error, durationMs: Date.now() - started });
  if (!endpoint || !token) return fail("Hermes is not configured.");
  const { resolveAgentRuntimeConfig } = await import("@/lib/agents/agent-config-store");
  const cfg = await resolveAgentRuntimeConfig("agent-visual-video", "crina").catch(() => ({ provider: "hermes", model: "crina" }));
  const model = cfg.provider === "hermes" ? cfg.model : "crina";
  const { refused, id: callId } = await beginModelCall("hermes", "agent-visual-video", model);
  if (refused) return fail(refused, model);
  // The tool's aspect_ratio is landscape | square | portrait and defaults to landscape: always pass it.
  const aspect = options.aspect === "landscape" ? "landscape" : options.aspect === "vertical" ? "portrait" : "square";
  const ask = `Generate exactly ONE image: call image_generate with aspect_ratio="${aspect}" (exactly that value). Do not add any text inside the image unless the prompt asks for it.\n\nImage prompt:\n${prompt.slice(0, 3500)}\n\nWhen the tool has saved the image, answer with JSON only: {"image_path": "<the absolute file path the tool returned>"}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: ask }] }),
      signal: AbortSignal.timeout(Number(process.env.HERMES_IMAGE_TIMEOUT_MS || 240000))
    });
    if (!res.ok) return fail(`Hermes returned HTTP ${res.status} for the image.`, model);
    const raw = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
    await finishModelCall(callId, { provider: "hermes", model, tokensIn: raw.usage?.prompt_tokens ?? null, tokensOut: raw.usage?.completion_tokens ?? null });
    const content = raw.choices?.[0]?.message?.content ?? "";
    const fromJson = (() => {
      try {
        return (JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as { image_path?: unknown }).image_path;
      } catch {
        return null;
      }
    })();
    const fromText = content.match(/\/[^\s"'`)]+\.(?:png|jpe?g|webp)/i)?.[0] ?? null;
    const file = safeHermesImagePath(fromJson) ?? safeHermesImagePath(fromText);
    if (!file) return fail(`Hermes did not return an image file (${content.slice(0, 160)}).`, model);
    const stat = await fs.stat(file);
    if (stat.size > 20 * 1024 * 1024) return fail("The Hermes image is larger than 20 MB.", model);
    const bytes = await fs.readFile(file);
    return { ok: true, url: null, bytes, provider: "hermes", model: `${model} (gpt-image-2 via ChatGPT plan)`, fallbackUsed: false, status: "generated", error: null, durationMs: Date.now() - started };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Hermes image failed.", model);
  }
}

export async function uploadMarketingAsset(bytes: Buffer, contentItemId: string, position: number) {
  if (!isSupabaseConfigured()) return null;
  const supabase = createServiceClient();
  if (!supabase) return null;

  const path = `${contentItemId}/${position}-${randomUUID()}.png`;
  const { error } = await supabase.storage.from("marketing-assets").upload(path, bytes, {
    contentType: "image/png",
    upsert: false
  });
  if (error) return null;
  const { data } = supabase.storage.from("marketing-assets").getPublicUrl(path);
  return data.publicUrl;
}

export async function generateMarketingImage(prompt: string, context: { contentItemId: string; position?: number; kind?: string } & ImageGenerationOptions): Promise<ImageGenerationResult> {
  const attempts: ImageGenerationResult[] = [];
  const options: ImageGenerationOptions = { aspect: context.aspect, size: context.size, quality: context.quality };
  // 1) Hermes on the ChatGPT plan ($0 per image). 2) Fallback: the OpenAI image API, charged per image.
  attempts.push(await generateHermesImage(prompt, options));
  if (!attempts[0].ok) {
    const { refused, id: callId } = await beginModelCall("gpt-image", "agent-visual-video", GPT_IMAGE_MODEL);
    if (refused) {
      return { ok: false, url: null, bytes: null, provider: "placeholder", model: "draft-placeholder", fallbackUsed: true, status: "placeholder", error: `${attempts[0].error ?? "Hermes image failed"}; ${refused}`, durationMs: 0 };
    }
    attempts.push(await generateGptImage(prompt, options));
    if (!attempts[1].ok) await finishModelCall(callId, { provider: "gpt-image", model: "failed", tokensIn: 0, tokensOut: 0 });
  }
  if (!attempts.some((attempt) => attempt.ok)) attempts.push(await generateHuggingFace(prompt, "flux", FLUX_MODEL, options));
  if (!attempts.some((attempt) => attempt.ok)) attempts.push(await generateReplicate(prompt, "flux", process.env.REPLICATE_FLUX_VERSION || FLUX_MODEL, options));
  if (!attempts.some((attempt) => attempt.ok)) attempts.push(await generateHuggingFace(prompt, "stability", STABILITY_MODEL, options));

  const result = attempts.find((attempt) => attempt.ok) ?? attempts[attempts.length - 1];
  const url = result.bytes ? await uploadMarketingAsset(result.bytes, context.contentItemId, context.position ?? 1) : null;
  const finalResult: ImageGenerationResult = result.ok && url ? { ...result, url } : { ...result, ok: false, url: null, provider: "placeholder", model: "draft-placeholder", fallbackUsed: true, status: "placeholder", error: result.error ?? "No image provider generated a stored asset." };

  await recordAgentRun({
    agentName: "Visual & Video Agent",
    agentId: "agent-visual-video",
    workflowName: "Generate Marketing Image Asset",
    provider: finalResult.provider,
    status: finalResult.status === "generated" ? (finalResult.fallbackUsed ? "fallback" : "success") : "fallback",
    input: { prompt: strengthenPrompt(prompt, options), contentItemId: context.contentItemId, position: context.position ?? 1, kind: context.kind ?? "image", aspect: context.aspect ?? "square", size: sizeForAspect(options), quality: options.quality ?? GPT_IMAGE_QUALITY, capabilities: ["image_generation"], routeOrigin: "lib.providers.image-generation" },
    output: { url: finalResult.url, model: finalResult.model, fallback_used: finalResult.fallbackUsed, status: finalResult.status },
    error: finalResult.error,
    model: finalResult.model,
    durationMs: finalResult.durationMs
  });

  return finalResult;
}

export const mediaCapabilities = {
  gptImage: { provider: "gpt-image", model: GPT_IMAGE_MODEL, quality: GPT_IMAGE_QUALITY, capabilities: ["image_generation"] },
  flux: { provider: "flux", model: FLUX_MODEL, capabilities: ["image_generation", "video_generation_partial"] },
  stability: { provider: "stability", model: STABILITY_MODEL, capabilities: ["image_generation", "video_generation_partial"] },
  videoGeneration: { enabled: false, capabilities: ["video_generation"], status: "coming_soon" }
};
