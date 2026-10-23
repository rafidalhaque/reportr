"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { apiGet, apiPost, errMessage } from "@/lib/api";
import type { ApplicationField, PlatformSettings, PublicProgram } from "@/lib/types";
import { PublicHeader, FullPageLoader } from "@/components/shell";
import { FieldInputs, type AnswerMap } from "@/components/application-fields";
import { ErrorAlert } from "@/components/alerts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

function ApplyForm() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("program") ?? "";

  const [programs, setPrograms] = useState<PublicProgram[]>([]);
  const [applicationsOpen, setApplicationsOpen] = useState<boolean | null>(null);
  const [fields, setFields] = useState<ApplicationField[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [programId, setProgramId] = useState(preselect);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    apiGet<PlatformSettings>("/public/platform")
      .then((s) => setApplicationsOpen(s.researcher_applications_enabled))
      .catch(() => setApplicationsOpen(true)); // fail open; the API still enforces the flag
    apiGet<ApplicationField[]>("/public/application-fields")
      .then(setFields)
      .catch(() => setFields([]));
    apiGet<PublicProgram[]>("/public/programs")
      .then(setPrograms)
      .catch(() => setPrograms([]));
  }, []);

  useEffect(() => {
    if (preselect) setProgramId(preselect);
  }, [preselect]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await apiPost("/public/applications", {
        email,
        name: name || undefined,
        program_id: programId || undefined,
        answers,
      });
      setDone(true);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (applicationsOpen === false) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <ShieldAlert className="h-10 w-10 text-slate-400" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Applications are closed</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The researcher application form is currently disabled. Please check back later.
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to home
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (applicationsOpen === null) {
    return <FullPageLoader label="Loading…" />;
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Application received</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Thanks for applying. Our team reviews applications regularly — if you are
            approved, you will receive an invite link at <strong>{email}</strong>.
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to home
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Apply to join</CardTitle>
        <CardDescription>
          Tell us a bit about yourself. Approved researchers receive an invite to the
          program by email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorAlert>{error}</ErrorAlert>}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name or handle"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="program">Program</Label>
            <Select id="program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">General application (no specific program)</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </Select>
          </div>

          <FieldInputs fields={fields} answers={answers} onChange={setAnswers} />

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit application
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ApplyPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Suspense fallback={<FullPageLoader label="Loading…" />}>
          <ApplyForm />
        </Suspense>
      </main>
    </div>
  );
}
