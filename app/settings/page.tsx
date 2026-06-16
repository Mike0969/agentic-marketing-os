import { KeyRound } from "lucide-react";
import { PageHeader, Panel, inputClass } from "@/components/ui";

const settings = [
  "OpenAI",
  "Anthropic",
  "DeepSeek",
  "Hermes Agent Runtime",
  "n8n webhook",
  "Telegram",
  "LinkedIn",
  "X",
  "TikTok",
  "Instagram",
  "Facebook",
  "Google Search Console",
  "GA4"
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="API key placeholders for model providers, automation, messaging, social platforms, and analytics services."
      />
      <Panel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {settings.map((setting) => (
            <label key={setting} className="block text-sm font-medium">
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-command" />
                {setting}
              </span>
              <input className={`${inputClass} mt-2`} placeholder="Not configured" type="password" />
            </label>
          ))}
        </div>
        <div className="mt-6 rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          TODO: Store secrets outside the browser. Use Supabase Edge Functions, Vercel environment variables, or a vault-backed integration service before connecting live agents.
        </div>
      </Panel>
    </>
  );
}
