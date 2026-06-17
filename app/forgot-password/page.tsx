"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail } from "lucide-react";
import { buttonClass, inputClass, Panel } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    const supabase = createClient();

    if (!supabase) {
      setError("Supabase Auth is not configured.");
      setIsSubmitting(false);
      return;
    }

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    setIsSubmitting(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Password reset email sent. Open the link in your inbox to set a new password.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Panel className="w-full max-w-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-command">Account Recovery</div>
            <h1 className="text-xl font-semibold">Forgot password</h1>
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium">
            Admin email
            <input className={`${inputClass} mt-2`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          {message ? <div className="rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</div> : null}
          <button type="submit" className={`${buttonClass} w-full`} disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send reset email"}
          </button>
        </form>

        <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-command hover:underline">
          Back to login
        </Link>
      </Panel>
    </main>
  );
}
