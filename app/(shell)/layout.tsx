import { OsShell } from "@/components/os/os-shell";
import { getShellAuthStatus } from "@/lib/auth";
import { getHermesHealth } from "@/lib/agents/hermes-health";

export const dynamic = "force-dynamic";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const [auth, hermes] = await Promise.all([getShellAuthStatus(), getHermesHealth()]);
  return (
    <OsShell auth={{ supabaseConfigured: auth.supabaseConfigured, email: auth.email }} hermes={{ configured: hermes.configured, connected: hermes.connected }}>
      {children}
    </OsShell>
  );
}
