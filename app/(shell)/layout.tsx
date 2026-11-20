import { OsShell } from "@/components/os/os-shell";
import { getShellAuthStatus } from "@/lib/auth";
import { getHermesHealth } from "@/lib/agents/hermes-health";
import { getBrandChoices } from "@/lib/marketing/brand-selection";

export const dynamic = "force-dynamic";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const [auth, hermes, brandChoices] = await Promise.all([getShellAuthStatus(), getHermesHealth(), getBrandChoices()]);
  return (
    <OsShell auth={{ supabaseConfigured: auth.supabaseConfigured, email: auth.email }} hermes={{ configured: hermes.configured, connected: hermes.connected }} brands={brandChoices.brands} selectedBrandId={brandChoices.selectedId}>
      {children}
    </OsShell>
  );
}
