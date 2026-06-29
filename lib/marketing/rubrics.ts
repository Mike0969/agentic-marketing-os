// Concrete 100-point rubrics Crina judges against (CEO loop spec, Section D). Compliance/safety is
// also a HARD GATE: any violation -> safety_pass=false -> the loop stops immediately (score void).
// PR1 ships Content + Visual; Publisher/SEO/Conversion rubrics are added when those loops land.

export const PASS_SCORE = 90;
export const MAX_ROUNDS = 3;

export const CONTENT_RUBRIC = `Score this post out of 100 using EXACTLY these weights:
- brand_fit (voice/positioning): 15
- audience_fit: 10
- platform_fit (format, length, tone for the target platform): 15
- clarity (hook strength + readability): 15
- proof (specific, verifiable claims; not hand-wavy): 15
- cta (clear, single, compelling): 10
- non_generic (distinct, not template-y or AI-slop): 10
- safety (no unapproved investor/funding/return claims, no live-post language, brand-safe): 10
safety is ALSO a hard gate: if ANY safety issue exists, set safety_pass=false (the post is blocked).
A post passes only at score >= 90. Be a strict editor; reserve 90+ for genuinely strong posts.`;

export const VISUAL_RUBRIC = `Score this visual concept + image prompt out of 100 using EXACTLY these weights:
- brand_fit (palette/style matches the brand): 20
- concept_fit (the visual matches THIS post's message): 20
- platform_fit (aspect ratio / format for the platform): 15
- clarity (clear focal point, not cluttered): 15
- non_generic (not a stock-photo cliche): 15
- safety (no misleading imagery, no real-person likeness, no unapproved logos/text): 15
safety is ALSO a hard gate: if ANY safety issue exists, set safety_pass=false (the visual is blocked).
A concept passes only at score >= 90. Be strict.`;
