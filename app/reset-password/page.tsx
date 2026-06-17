"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { buttonClass, inputClass, Panel } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparingSession, setIsPreparingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function prepareRecoverySession() {
      const supabase = createClient();

      if (!supabase) {
        if (mounted) {
          setError("Supabase Auth is not configured.");
          setIsPreparingSession(false);
        }
        return;
      }

      const code = searchParams.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError && mounted) setError(exchangeError.message);
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (sessionError && mounted) setError(sessionError.message);
        window.history.replaceState(null, "", window.location.pathname);
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (mounted) {
        setHasRecoverySession(Boolean(session));
        setIsPreparingSession(false);
      }
    }

    prepareRecoverySession();

    return () => {
      mounted = false;
    };
  }, [searchParams]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!hasRecoverySession) {
      setError("Open the password reset link from your email first, then set the new password here.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    if (!supabase) {
      setError("Supabase Auth is not configured.");
      setIsSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Panel className="w-full max-w-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-command">Account Recovery</div>
            <h1 className="text-xl font-semibold">Set new password</h1>
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium">
            New password
            <input className={`${inputClass} mt-2`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium">
            Confirm password
            <input className={`${inputClass} mt-2`} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </label>
          {error ? <div className="rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</div> : null}
          {!hasRecoverySession && !isPreparingSession ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
              This page needs a valid reset link from your email before it can change the password.
            </div>
          ) : null}
          <button type="submit" className={`${buttonClass} w-full`} disabled={isSubmitting || isPreparingSession || !hasRecoverySession}>
            {isPreparingSession ? "Checking reset link..." : isSubmitting ? "Saving..." : "Update password"}
          </button>
        </form>

        <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-command hover:underline">
          Back to login
        </Link>
      </Panel>
    </main>
  );
}
