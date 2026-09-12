"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { loginErrorMessage, loginForm } from "@/lib/api";
import { resetMe, useMe } from "@/components/auth";
import { PublicHeader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function StaffLoginPage() {
  const router = useRouter();
  const { me, loading } = useMe();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Already signed in as staff → straight to the dashboard.
  useEffect(() => {
    if (!loading && me?.kind === "staff") {
      router.replace("/dashboard");
    }
  }, [loading, me, router]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await loginForm("staff", email, password);
      resetMe(); // drop the cached logged-out /me before the guard re-checks
      router.replace("/dashboard");
    } catch (err) {
      setError(loginErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Card className="mx-auto max-w-sm">
          <CardHeader>
            <CardTitle>Staff sign in</CardTitle>
            <CardDescription>Sign in with your staff account email.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <ErrorAlert>{error}</ErrorAlert>}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
              Are you a researcher?{" "}
              <Link href="/researcher/login" className="font-medium text-indigo-600 hover:underline">
                Sign in here
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
