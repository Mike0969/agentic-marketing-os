import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env-loader.mjs";

const { url, publicKey } = getSupabaseEnv();

if (!url || !publicKey) {
  console.log("Supabase local env: missing NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, publicKey);

const checks = [
  {
    name: "content_items workflow stage columns",
    run: () =>
      supabase
        .from("content_items")
        .select("id,workflow_stage,current_owner,next_owner,human_feedback_tags,crina_review_notes,agent_handoff_summary")
        .limit(1)
  },
  {
    name: "agent_runs observability columns",
    run: () =>
      supabase
        .from("agent_runs")
        .select("id,agent_id,model,backup_model,tokens_prompt,tokens_completion,tokens_total,duration_ms,brain_resources_used,handoff_from,handoff_to,provider_response_status")
        .limit(1)
  },
  {
    name: "agent_learning_events table",
    run: () => supabase.from("agent_learning_events").select("id,agent_id,agent_name,decision,tags,summary,created_at").limit(1)
  }
];

let failed = false;

for (const check of checks) {
  const { error } = await check.run();
  if (error) {
    failed = true;
    console.log(`✗ ${check.name}: ${error.message}`);
  } else {
    console.log(`✓ ${check.name}`);
  }
}

if (failed) {
  console.log("\nWorkflow schema is incomplete. Run supabase/repair_workflow_schema.sql in the Supabase SQL Editor, then run this check again.");
  process.exit(1);
}

console.log("\nWorkflow schema: OK");
