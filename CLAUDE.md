## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

<!-- dispatch-kit:start -->
## Multi-model dispatch (installed by codex-dispatch-kit)

This repo uses ROUTING.md for multi-model dispatch. Before planning, dispatching,
or reviewing work here, read ROUTING.md at the repo root and follow its dispatch
table and trigger phrases. Plan reviews are challenged against REVIEW-RUBRIC.md.
Codex model profiles live in .codex/config.toml (sol default, terra/luna profiles).
<!-- dispatch-kit:end -->
