"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiPost, errMessage } from "@/lib/api";
import { PublicHeader, FullPageLoader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const kind = searchParams.get("kind") === "researchers" ? "researchers" : "staff";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiPost(`/auth/${kind}/reset-password`, { token, password });
      setDone(true);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const loginHref = kind === "researchers" ? "/researcher/login" : "/login";

  return (
    <Card className="mx-auto max-w-md">
      {done ? (
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Password updated
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Your password has been changed. Sign in with the new one.
          </p>
          <Link href={loginHref} className={buttonVariants({ size: "sm" })}>
            Sign in
          </Link>
        </CardContent>
      ) : (
        <>
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>
              The link is valid for one hour after it was requested.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <ErrorAlert>{error}</ErrorAlert>}
              <div className="space-y-1.5">
                <Label htmlFor="reset-pw">New password</Label>
                <Input
                  id="reset-pw"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-confirm">Confirm new password</Label>
                <Input
                  id="reset-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !token}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Set new password
              </Button>
            </form>
          </CardContent>
        </>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Suspense fallback={<FullPageLoader />}>
          <ResetPasswordForm />
        </Suspense>
      </main>
    </div>
  );
}
