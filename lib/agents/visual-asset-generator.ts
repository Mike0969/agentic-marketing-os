import type { Brand, ContentItem } from "@/lib/types";

type VisualAssetInput = {
  item: ContentItem;
  brand: Brand | null | undefined;
  visualDirection: string;
  copyDraft: string;
};

export type VisualAssetResult = {
  status: "generated" | "placeholder" | "error";
  dataUrl: string | null;
  prompt: string;
  model: string;
  error: string | null;
};

function sizeForPlatform(platform: string) {
  const normalized = platform.toLowerCase();
  if (normalized.includes("youtube") || normalized.includes("linkedin") || normalized.includes("blog")) return "1536x1024";
  if (normalized.includes("tiktok") || normalized.includes("instagram")) return "1024x1536";
  return "1024x1024";
}

function buildPrompt({ item, brand, visualDirection, copyDraft }: VisualAssetInput) {
  const brandTone = brand?.tone_of_voice ?? "serious, credible, modern";
  const brandPositioning = brand?.positioning ?? "B2B technology and infrastructure";
  return [
    `Create a professional social media visual for ${brand?.name ?? "the brand"}.`,
    `Brand positioning: ${brandPositioning}.`,
    `Tone: ${brandTone}.`,
    `Platform: ${item.platform}. Content type: ${item.content_type}.`,
    `Post title: ${item.title}.`,
    `Hook: ${item.hook}.`,
    `CTA context: ${item.CTA}.`,
    `Copy context: ${copyDraft.slice(0, 1400)}.`,
    `Visual direction from the Visual & Video Agent: ${visualDirection.slice(0, 1800)}.`,
    "Style: investor-grade SaaS command-center quality, clean composition, premium lighting, credible technology aesthetic.",
    "Avoid tiny unreadable text, fake logos, misleading claims, cartoon style, meme style, and clutter.",
    "If text is included, keep it minimal, large, and generic; the final caption will be handled separately."
  ].join("\n");
}

function svgPlaceholder(input: VisualAssetInput, prompt: string) {
  const brand = input.brand?.name ?? "Visual Agent";
  const title = input.item.title.slice(0, 58);
  const subtitle = input.item.platform;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#08111f"/>
  <rect x="54" y="54" width="1092" height="692" rx="28" fill="#f8fafc"/>
  <rect x="90" y="90" width="1020" height="110" rx="18" fill="#0f766e"/>
  <text x="122" y="158" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff">${escapeXml(brand)}</text>
  <text x="122" y="305" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="#0f172a">${escapeXml(title)}</text>
  <text x="122" y="388" font-family="Arial, sans-serif" font-size="30" fill="#475569">${escapeXml(subtitle)} creative placeholder</text>
  <rect x="122" y="472" width="956" height="4" fill="#cbd5e1"/>
  <text x="122" y="560" font-family="Arial, sans-serif" font-size="28" fill="#334155">Add OPENAI_API_KEY to generate real image assets.</text>
  <text x="122" y="620" font-family="Arial, sans-serif" font-size="22" fill="#64748b">${escapeXml(prompt.slice(0, 120))}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char] ?? char);
}

function getTimeoutMs() {
  const configured = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 180000;
}

export async function generateVisualAsset(input: VisualAssetInput): Promise<VisualAssetResult> {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const prompt = buildPrompt(input);

  if (!process.env.OPENAI_API_KEY) {
    return {
      status: "placeholder",
      dataUrl: svgPlaceholder(input, prompt),
      prompt,
      model: "local-svg-placeholder",
      error: "OPENAI_API_KEY is not configured."
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        size: process.env.OPENAI_IMAGE_SIZE || sizeForPlatform(input.item.platform),
        quality: process.env.OPENAI_IMAGE_QUALITY || "low",
        n: 1
      }),
      signal: AbortSignal.timeout(getTimeoutMs())
    });

    const raw = (await response.json().catch(() => ({}))) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string; code?: string };
    };

    if (!response.ok) {
      return {
        status: "error",
        dataUrl: svgPlaceholder(input, prompt),
        prompt,
        model,
        error: raw.error?.message ?? `OpenAI image generation returned HTTP ${response.status}.`
      };
    }

    const image = raw.data?.[0];
    if (image?.b64_json) {
      return { status: "generated", dataUrl: `data:image/png;base64,${image.b64_json}`, prompt, model, error: null };
    }

    if (image?.url) {
      return { status: "generated", dataUrl: image.url, prompt, model, error: null };
    }

    return {
      status: "error",
      dataUrl: svgPlaceholder(input, prompt),
      prompt,
      model,
      error: "OpenAI image response did not include image data."
    };
  } catch (cause) {
    return {
      status: "error",
      dataUrl: svgPlaceholder(input, prompt),
      prompt,
      model,
      error: cause instanceof Error ? cause.message : "OpenAI image generation failed."
    };
  }
}
