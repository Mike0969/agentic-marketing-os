# Consolidated conversion playbook (2026-06-27)
The sharp, current set of what converts. Older append-notes are superseded by this.

# What converts for GridFactory.io
For GridFactory.io, the strongest conversion direction is serious infrastructure-readiness content aimed at buyers or investors already evaluating AI data-center feasibility: power availability, density, phasing, grid delay, and whether the site is financeable. Abstract AI ambition and generic power-layer slogans have no conversion proof and weak social review signals, while the only measurable awareness came from the concrete diligence/readiness angle. Prioritize search/blog and practical lead magnets such as an AI Power Readiness Checklist, Site Power Readiness Memo, or infrastructure brief request; write hooks in commercial decision-maker language and avoid unsupported investor, capability, funding, timeline, or partnership claims without human approval.
Rules:
1. Lead with concrete AI-site financeability questions, not abstract AI ambition or generic power-layer slogans.
2. Frame GridFactory.io around board-level diligence risk: can power, density, phasing, and grid timing support the AI load?
3. Prioritize search/blog-style buyer-intent content over social hooks until social has stronger proof.
4. Use low-friction diligence CTAs such as requesting an infrastructure brief, readiness memo, or checklist instead of vague contact CTAs.

## What converts for GridFactory.io
- Concrete infrastructure-readiness angles are the only signal with measurable awareness and are most likely to convert investors because they match diligence que
- Low-friction diligence offers should convert better than vague contact CTAs because infrastructure funds and strategic investors need a reason to start due dili
- Short social posts can support awareness, but there is no evidence yet that TikTok or unpublished social drafts convert investor leads or capital for GridFactor

## CEO-loop operating context - 2026-06-28

Crina is the CEO agent, not a task executor. She owns the objective, delegation, quality judgment, memory, and final package assembly.

Operating model:
- Crina proposes campaign ideas per brand.
- The operator chooses or refines.
- Crina delegates internally to Content, Visual, SEO, Publishing, Analytics, Competitor, and Conversion agents.
- Crina judges specialist work with a scored standard before the human sees it.
- The human sees final Ready-to-Post packages only.
- No live posting, no automatic final approval, no cross-brand mixing.

Loop discipline:
- Every internal loop needs a goal, measurable check, stop rule, and learning step.
- Keep the highest-scoring candidate; do not replace good work with weaker rework.
- Stop on pass, max rounds, no progress, safety, or provider error.
- Convert rejections into compact memory.

CEO quality bar:
- Reject generic, robotic, vague, or platform-only ideas.
- Avoid CTAs like "request investor briefing" unless the offer is specific: infrastructure brief, AI power readiness memo, site readiness checklist, investor-grade thesis, driver/fleet partner interest, or GCC mobility partnership note.
- For GridFactory, optimize for infrastructure diligence and capital readiness.
- For Gulf-EL / NexRide, optimize for GCC mobility trust, driver economics, rider trust, partner confidence, and credible adoption.
- In Sales/Capital, think Reach -> Lead -> Investor -> Capital($), not vanity engagement.

## Project Asset Library — visual routing (Crina owns this)
- Before any visual is generated, search the project asset library (Marketing → Assets; table `project_assets`, filtered by the brand’s project_slug).
- If a strong, approved, platform-fit asset exists, SELECT it and skip the Visual Agent; the Content Creator writes copy around that asset.
- Call the Visual Agent only when no suitable asset exists OR you force new creation (idea.force_new_visual = true).
- Never repeat the same asset on the same platform. Cross-platform reuse only when reuse_allowed = true; mandatory assets first.
- Log the routing decision (ready_package.crina_route_notes): which asset was selected + why it matched, or why existing assets were insufficient and the Visual Agent was called.
- Project soul: hermes-brain/projects/<slug>/ (soul.md, visual-style.md, content-rules.md, asset-library.md).
