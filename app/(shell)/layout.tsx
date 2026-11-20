import { OsShell } from "@/components/os/os-shell";
import { getShellAuthStatus } from "@/lib/auth";
import { getHermesHealth } from "@/lib/agents/hermes-health";
import { getBrandChoices } from "@/lib/marketing/brand-selection";
import { unseenJobs } from "@/lib/marketing/campaign-jobs";

export const dynamic = "force-dynamic";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const [auth, hermes, brandChoices, jobs] = await Promise.all([getShellAuthStatus(), getHermesHealth(), getBrandChoices(), unseenJobs()]);
  return (
    <OsShell auth={{ supabaseConfigured: auth.supabaseConfigured, email: auth.email }} hermes={{ configured: hermes.configured, connected: hermes.connected }} brands={brandChoices.brands} selectedBrandId={brandChoices.selectedId} alerts={jobs.map((j) => ({ campaignId: j.campaignId, title: j.title, state: j.job.state, summary: j.job.summary ?? "", at: j.job.finished_at ?? null }))}>
      {children}
    </OsShell>
  );
}
