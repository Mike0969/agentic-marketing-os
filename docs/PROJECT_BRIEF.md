# Agentic Marketing Agency OS - Project Brief

The Agentic Marketing Agency OS is a dashboard/control tower for managing AI-assisted marketing operations across two brands:

- GridFactory.io: AI/grid/data-center power infrastructure, investor-grade, technical B2B.
- Gulf-EL.com / NexRide: electric mobility, zero-commission ride-hailing, AI ride-hailing, tokenized loyalty, GCC mobility.

The current MVP provides brand profiles, agent roster, campaign planning, content pipeline, approval queue, analytics placeholders, server-backed settings, and Crina's weekly content plan workflow.

The system does not publish content automatically. Generated and created content enters the pipeline as `idea` or `brief`, then requires human review before later publishing integrations are added.

Current state:

- Supabase Auth protects dashboard routes when Supabase env is configured.
- Admin access is controlled by `admin_users` or local `ADMIN_EMAIL`.
- Core mutations persist through server routes with local JSON fallback when Supabase is not configured.
- Settings stores integration metadata and server-side secret references for Hermes, model providers, automation, social, and analytics connectors.
- Crina uses Hermes first when `HERMES_AGENT_ENDPOINT` is configured, otherwise deterministic fallback.
