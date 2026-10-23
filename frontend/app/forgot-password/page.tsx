"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MailCheck, Loader2 } from "lucide-react";
import { apiPost, errMessage } from "@/lib/api";
import { PublicHeader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Kind = "staff" | "researchers";

/** Password reset request — mails the reset link when platform SMTP is configured. */
export default function ForgotPasswordPage() {
  const [kind, setKind] = useState<Kind>("staff");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // The login pages link here with ?kind=staff|researchers.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("kind") === "researchers") setKind("researchers");
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiPost(`/auth/${kind}/forgot-password`, { email });
      setSent(true); // the API answers 202 regardless of whether the account exists
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Card className="mx-auto max-w-md">
          {sent ? (
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <MailCheck className="h-10 w-10 text-emerald-500" />
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Check your inbox
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                If an account exists for <strong>{email}</strong> and email delivery is
                configured, a reset link is on its way. The link is valid for one hour.
              </p>
              <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Back to home
              </Link>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Forgot your password?</CardTitle>
                <CardDescription>
                  Enter your account email and we&apos;ll send you a reset link.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSubmit} className="space-y-4">
                  {error && <ErrorAlert>{error}</ErrorAlert>}

                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["staff", "I'm staff"],
                        ["researchers", "I'm a researcher"],
                      ] as [Kind, string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setKind(value)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                          kind === value
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                            : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send reset link
                  </Button>
                </form>
                <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  Remembered it?{" "}
                  <Link
                    href={kind === "staff" ? "/login" : "/researcher/login"}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    Sign in
                  </Link>
                </p>
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
