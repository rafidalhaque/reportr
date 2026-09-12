"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ShieldX } from "lucide-react";
import { apiGet, apiPost, errMessage } from "@/lib/api";
import type { InviteInfo } from "@/lib/types";
import { resetMe } from "@/components/auth";
import { PublicHeader, FullPageLoader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = typeof params?.token === "string" ? params.token : "";

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [checking, setChecking] = useState(true);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    apiGet<InviteInfo>(`/public/invites/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((e) => setLoadError(errMessage(e)))
      .finally(() => setChecking(false));
  }, [token]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await apiPost("/auth/researchers/register", {
        token,
        password,
        name: name || undefined,
      });
      resetMe();
      router.replace("/researcher");
    } catch (err) {
      setError(errMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {checking && token && <FullPageLoader label="Checking invite…" />}

        {loadError && (
          <Card className="mx-auto max-w-md">
            <CardContent className="p-8">
              <ErrorAlert>{loadError}</ErrorAlert>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                This invite link may be malformed. Ask the program team to resend it.
              </p>
            </CardContent>
          </Card>
        )}

        {info && !info.valid && (
          <Card className="mx-auto max-w-md">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <ShieldX className="h-10 w-10 text-red-400" />
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Invite not valid</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">{info.reason || "This invite cannot be used."}</p>
              <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Back to home
              </Link>
            </CardContent>
          </Card>
        )}

        {info && info.valid && (
          <Card className="mx-auto max-w-md">
            <CardHeader>
              <CardTitle>Join {info.program_name || "the program"}</CardTitle>
              <CardDescription>
                This invite was issued for{" "}
                <strong className="font-medium text-slate-700 dark:text-slate-300">{info.email_masked}</strong>. Set a
                password to activate your researcher account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                {error && <ErrorAlert>{error}</ErrorAlert>}

                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name or handle (optional)"
                    autoComplete="name"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password *</Label>
                  <Input
                    id="confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {!checking && !token && !loadError && (
          <Card className="mx-auto max-w-md">
            <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Missing invite token.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
