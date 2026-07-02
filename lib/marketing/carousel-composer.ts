import sharp from "sharp";
import { uploadMarketingAsset } from "@/lib/providers/image-generation";

type SlideText = {
  headline?: string | null;
  text?: string | null;
  brandName?: string | null;
  position: number;
  total: number;
  contentItemId: string;
  backgroundUrl: string | null;
};

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function lines(value: string, maxChars: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const output: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      output.push(current);
      current = word;
      if (output.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (current && output.length < maxLines) output.push(current);
  return output;
}

function textBlock(value: string, x: number, y: number, size: number, weight: number, maxChars: number, maxLines: number, lineHeight: number) {
  return lines(value, maxChars, maxLines)
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" font-size="${size}" font-weight="${weight}" fill="#f8fafc">${escapeXml(line)}</text>`)
    .join("");
}

function overlaySvg(args: SlideText) {
  const headline = (args.headline || "Infrastructure readiness").trim();
  const body = (args.text || "").trim();
  const brand = (args.brandName || "GridFactory.io").trim();
  const cover = args.position === 1;
  const headlineSize = cover ? 74 : 58;
  const headlineLines = cover ? 4 : 3;
  const bodyY = cover ? 650 : 590;
  return Buffer.from(`
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#020617" stop-opacity="0.72"/>
      <stop offset="48%" stop-color="#020617" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="0.82"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" x2="1">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="#111827" stop-opacity="0.62"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#shade)"/>
  <rect x="64" y="64" width="896" height="896" rx="28" fill="none" stroke="#e2e8f0" stroke-opacity="0.16" stroke-width="2"/>
  <rect x="64" y="64" width="7" height="896" rx="3.5" fill="#22d3ee"/>
  <rect x="104" y="100" width="816" height="${body ? 760 : 650}" rx="24" fill="url(#panel)"/>
  <text x="132" y="158" font-size="26" font-weight="700" fill="#67e8f9" letter-spacing="2">${escapeXml(brand.toUpperCase())}</text>
  <text x="132" y="205" font-size="22" font-weight="600" fill="#cbd5e1">${args.position} / ${args.total}</text>
  ${textBlock(headline, 132, cover ? 355 : 330, headlineSize, 850, cover ? 18 : 22, headlineLines, headlineSize + 14)}
  ${body ? textBlock(body, 132, bodyY, 32, 550, 42, 4, 46) : ""}
  <rect x="132" y="878" width="220" height="5" rx="2.5" fill="#22d3ee"/>
  <text x="132" y="928" font-size="24" font-weight="700" fill="#f8fafc">Power readiness before the pitch.</text>
</svg>`);
}

async function fetchBuffer(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Carousel background fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function composeCarouselSlide(args: SlideText): Promise<string | null> {
  if (!args.backgroundUrl) return null;
  try {
    const background = await fetchBuffer(args.backgroundUrl);
    const png = await sharp(background)
      .resize(1024, 1024, { fit: "cover", position: "center" })
      .modulate({ saturation: 0.82, brightness: 0.88 })
      .composite([{ input: overlaySvg(args), top: 0, left: 0 }])
      .png({ quality: 92 })
      .toBuffer();
    return await uploadMarketingAsset(png, args.contentItemId, args.position + 100);
  } catch (error) {
    console.error("[carousel-composer] failed", error instanceof Error ? error.message : String(error));
    return args.backgroundUrl;
  }
}
