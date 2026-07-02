import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getContentItem } from "@/lib/content-store";
import { composeCarouselSlide } from "@/lib/marketing/carousel-composer";
import { assetKindFor, desiredAssetCount, getContentAssets, saveContentAssets } from "@/lib/marketing/ready-package";
import { generateMarketingImage } from "@/lib/providers/image-generation";
import type { ReadyPackageAsset } from "@/lib/types";

function promptFor(item: NonNullable<Awaited<ReturnType<typeof getContentItem>>>, position: number, total: number) {
  const slide = item.ready_package?.slides?.[position - 1];
  if (slide) {
    return [
      `Instagram carousel slide ${position} of ${total} for ${item.platform}.`,
      `Slide headline: ${slide.headline || item.hook || item.title}.`,
      slide.text ? `Slide message: ${slide.text}.` : null,
      `Caption context: ${item.ready_package?.caption || item.body}.`,
      "Premium photorealistic infrastructure visual, clean composition, high detail, no readable text in the image."
    ]
      .filter(Boolean)
      .join(" ");
  }
  const basePrompt = item.visual_asset_prompt || item.ready_package?.alt_text || item.hook || item.title;
  if (total <= 1) return basePrompt;
  return `${basePrompt}\nCarousel slide ${position} of ${total}. Keep visual continuity with slide 1, no unverified claims, professional social-media-ready composition.`;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const item = await getContentItem(id);
  if (!item) return NextResponse.json({ error: "Content item not found." }, { status: 404 });

  const total = desiredAssetCount(item);
  const existing = await getContentAssets([id]);
  const existingPositions = new Set(existing.map((asset) => asset.position));
  const kind = assetKindFor(item);
  const missingPositions = Array.from({ length: total }, (_, index) => index + 1).filter((position) => !existingPositions.has(position));

  if (!missingPositions.length) {
    return NextResponse.json({ generated: 0, assets: existing, message: "All assets already exist." });
  }

  const assets: ReadyPackageAsset[] = [];
  for (const position of missingPositions) {
    const prompt = promptFor(item, position, total);
    const image = await generateMarketingImage(prompt, { contentItemId: id, position, kind, aspect: kind === "carousel_slide" ? "square" : "landscape" });
    const slide = item.ready_package?.slides?.[position - 1];
    const composedUrl =
      kind === "carousel_slide"
        ? await composeCarouselSlide({
            backgroundUrl: image.url,
            contentItemId: id,
            position,
            total,
            brandName: item.ready_package?.platform,
            headline: slide?.headline || item.hook || item.title,
            text: slide?.text
          })
        : null;
    assets.push({
      kind,
      url: composedUrl ?? image.url,
      prompt,
      position,
      model: image.model,
      provider: image.provider,
      status: image.status,
      error: image.error
    });
  }

  const saved = await saveContentAssets(id, assets, { replace: false });
  return NextResponse.json({ generated: saved.length, assets: saved });
}
