import OpenAI from "openai";
import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { recordAgentRun } from "@/lib/agents/agent-runs";

export type ImageGenerationResult = {
  ok: boolean;
  url: string | null;
  bytes: Buffer | null;
  provider: "gpt-image" | "flux" | "stability" | "placeholder";
  model: string;
  fallbackUsed: boolean;
  status: "generated" | "placeholder" | "error";
  error: string | null;
  durationMs: number;
};

const GPT_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const GPT_IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || "low";
const FLUX_MODEL = process.env.FLUX_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
const STABILITY_MODEL = process.env.STABILITY_IMAGE_MODEL || "stabilityai/stable-diffusion-xl-base-1.0";

function dataUrlToBuffer(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",");
  return Buffer.from(base64 || dataUrl, "base64");
}

async function generateGptImage(prompt: string): Promise<ImageGenerationResult> {
  const started = Date.now();
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, url: null, bytes: null, provider: "gpt-image", model: GPT_IMAGE_MODEL, fallbackUsed: false, status: "error", error: "OPENAI_API_KEY is not configured.", durationMs: Date.now() - started };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.images.generate({
      model: GPT_IMAGE_MODEL,
      prompt,
      size: "1024x1024",
      quality: GPT_IMAGE_QUALITY
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

async function generateHuggingFace(prompt: string, provider: "flux" | "stability", model: string): Promise<ImageGenerationResult> {
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
      body: JSON.stringify({ inputs: prompt })
    });
    if (!response.ok) throw new Error(`Hugging Face ${provider} failed: ${response.status} ${await response.text()}`);
    return { ok: true, url: null, bytes: Buffer.from(await response.arrayBuffer()), provider, model, fallbackUsed: true, status: "generated", error: null, durationMs: Date.now() - started };
  } catch (error) {
    return { ok: false, url: null, bytes: null, provider, model, fallbackUsed: true, status: "error", error: error instanceof Error ? error.message : `${provider} failed.`, durationMs: Date.now() - started };
  }
}

async function generateReplicate(prompt: string, provider: "flux" | "stability", model: string): Promise<ImageGenerationResult> {
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
      body: JSON.stringify({ version: model, input: { prompt } })
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

export async function generateMarketingImage(prompt: string, context: { contentItemId: string; position?: number; kind?: string }): Promise<ImageGenerationResult> {
  const attempts: ImageGenerationResult[] = [];
  attempts.push(await generateGptImage(prompt));
  if (!attempts[0].ok) attempts.push(await generateHuggingFace(prompt, "flux", FLUX_MODEL));
  if (!attempts.some((attempt) => attempt.ok)) attempts.push(await generateReplicate(prompt, "flux", process.env.REPLICATE_FLUX_VERSION || FLUX_MODEL));
  if (!attempts.some((attempt) => attempt.ok)) attempts.push(await generateHuggingFace(prompt, "stability", STABILITY_MODEL));

  const result = attempts.find((attempt) => attempt.ok) ?? attempts[attempts.length - 1];
  const url = result.bytes ? await uploadMarketingAsset(result.bytes, context.contentItemId, context.position ?? 1) : null;
  const finalResult: ImageGenerationResult = result.ok && url ? { ...result, url } : { ...result, ok: false, url: null, provider: "placeholder", model: "draft-placeholder", fallbackUsed: true, status: "placeholder", error: result.error ?? "No image provider generated a stored asset." };

  await recordAgentRun({
    agentName: "Visual & Video Agent",
    agentId: "agent-visual-video",
    workflowName: "Generate Marketing Image Asset",
    provider: finalResult.provider,
    status: finalResult.status === "generated" ? (finalResult.fallbackUsed ? "fallback" : "success") : "fallback",
    input: { prompt, contentItemId: context.contentItemId, position: context.position ?? 1, kind: context.kind ?? "image", capabilities: ["image_generation"], routeOrigin: "lib.providers.image-generation" },
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
