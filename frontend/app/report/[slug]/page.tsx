"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { apiGet, apiPost, errMessage } from "@/lib/api";
import type { PublicReportFormInfo, PublicReportSubmitResult } from "@/lib/types";
import { SEVERITIES } from "@/lib/constants";
import { titleCase } from "@/lib/utils";
import cweList from "@/lib/cwe_list.json";
import { PublicHeader, FullPageLoader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { CvssCalculator } from "@/components/cvss-calculator";
import { Markdown } from "@/components/markdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

/** Public, shareable report form for one program — anonymous or email-only submission. */
export default function PublicReportPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<PublicReportFormInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    apiGet<PublicReportFormInfo>(`/public/programs/${slug}/report-form`)
      .then(setInfo)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {loading ? (
          <FullPageLoader label="Loading form…" />
        ) : notFound || !info ? (
          <ClosedCard
            title="Program not found"
            message="This report form does not exist. Check the link you were given."
          />
        ) : !info.available ? (
          <ClosedCard title="Reporting closed" message={info.reason ?? "This form is not available."} />
        ) : (
          <ReportForm info={info} />
        )}
      </main>
    </div>
  );
}

function ClosedCard({ title, message }: { title: string; message: string }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-slate-400" />
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to home
        </Link>
      </CardContent>
    </Card>
  );
}

function ReportForm({ info }: { info: PublicReportFormInfo }) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<string>("medium");
  const [affectedAsset, setAffectedAsset] = useState("");
  const [cvss, setCvss] = useState("");
  const [cweId, setCweId] = useState("");
  const [description, setDescription] = useState("");
  const [reproSteps, setReproSteps] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublicReportSubmitResult | null>(null);

  const hasScope = info.scope_entries.length > 0 || info.scope_markdown.trim().length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const submitted = await apiPost<PublicReportSubmitResult>(
        `/public/programs/${info.program_slug}/reports`,
        {
          title,
          severity,
          description: description || undefined,
          repro_steps: reproSteps || undefined,
          affected_asset: affectedAsset || undefined,
          cvss: cvss || undefined,
          cwe_id: cweId || undefined,
          email: email || undefined, // omit → anonymous submission
        }
      );
      setResult(submitted);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Report received</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Thank you. Your submission to <strong>{info.program_name}</strong> is in the triage
            queue. Keep this reference for any correspondence:
          </p>
          <p className="rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-1.5 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
            {result.reference}
          </p>
          {result.email && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              We may reach out at <strong>{result.email}</strong> for follow-up questions.
            </p>
          )}
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to home
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {hasScope && (
        <Card>
          <CardHeader>
            <CardTitle>Program scope</CardTitle>
            <CardDescription>
              Read this first — reports outside scope may be rejected without a bounty.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {info.scope_entries.length > 0 && (
              <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Target</th>
                      <th className="px-3 py-2 font-medium">Scope</th>
                      <th className="px-3 py-2 font-medium">Severity guide</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {info.scope_entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-200">
                          {entry.target}
                          {entry.description && (
                            <div className="mt-0.5 font-sans text-slate-500 dark:text-slate-400">
                              {entry.description}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {entry.in_scope ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900">
                              In
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                              Out
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                          {entry.severity_guide ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {info.scope_markdown.trim() && <Markdown content={info.scope_markdown} />}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Report a vulnerability — {info.program_name}</CardTitle>
          <CardDescription>
            {info.description ||
              "Describe the issue in as much detail as possible."}{" "}
            You can submit <strong>anonymously</strong> or leave a contact email — no account
            needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <ErrorAlert>{error}</ErrorAlert>}

            <div className="space-y-1.5">
              <Label htmlFor="pub-title">Title *</Label>
              <Input
                id="pub-title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary of the vulnerability"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pub-severity">Severity</Label>
                <Select id="pub-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pub-asset">Affected asset / URL</Label>
                <Input
                  id="pub-asset"
                  value={affectedAsset}
                  onChange={(e) => setAffectedAsset(e.target.value)}
                  placeholder="https://target.example.com/path"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-cwe">Type of bug</Label>
              <Select id="pub-cwe" value={cweId} onChange={(e) => setCweId(e.target.value)}>
                <option value="">Not sure / other</option>
                {cweList.map((cwe) => (
                  <option key={cwe.id} value={cwe.id}>
                    {cwe.id} — {cwe.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-description">Description</Label>
              <Textarea
                id="pub-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is the issue and what is its impact?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-repro">Steps to reproduce</Label>
              <Textarea
                id="pub-repro"
                rows={5}
                value={reproSteps}
                onChange={(e) => setReproSteps(e.target.value)}
                placeholder={"1. Go to …\n2. Do …\n3. Observe …"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-cvss">CVSS vector (optional)</Label>
              <Input
                id="pub-cvss"
                className="font-mono text-xs"
                value={cvss}
                onChange={(e) => setCvss(e.target.value)}
                placeholder="CVSS:3.1/AV:N/AC:L/…"
              />
              <CvssCalculator value={cvss} onChange={setCvss} onApplySeverity={setSeverity} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pub-email">Contact email (optional)</Label>
              <Input
                id="pub-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Leave blank to submit anonymously"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Without an email the submission is fully anonymous — keep the reference code shown
                after submitting if you want to follow up.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit report
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
