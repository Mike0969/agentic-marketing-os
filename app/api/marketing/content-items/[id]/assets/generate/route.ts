import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getContentItem } from "@/lib/content-store";
import { assetKindFor, desiredAssetCount, getContentAssets, saveContentAssets } from "@/lib/marketing/ready-package";
import { generateMarketingImage } from "@/lib/providers/image-generation";
import type { ReadyPackageAsset } from "@/lib/types";

function promptFor(item: NonNullable<Awaited<ReturnType<typeof getContentItem>>>, position: number, total: number) {
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
    const image = await generateMarketingImage(prompt, { contentItemId: id, position, kind });
    assets.push({
      kind,
      url: image.url,
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
