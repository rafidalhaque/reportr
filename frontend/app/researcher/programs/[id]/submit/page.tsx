"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { apiGet, apiPost, errMessage } from "@/lib/api";
import { SEVERITIES } from "@/lib/constants";
import { titleCase } from "@/lib/utils";
import cweList from "@/lib/cwe_list.json";
import type { ProgramDetail, Report, UploadOut } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, InfoAlert } from "@/components/alerts";
import { AttachmentsPicker } from "@/components/attachments";
import { CvssCalculator } from "@/components/cvss-calculator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

/** Report submission form for a program, opened from the program page's "Submit report" button. */
export default function SubmitReportPage() {
  const { me, loading } = useMe("researcher");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const programId = typeof params?.id === "string" ? params.id : "";

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<string>("medium");
  const [affectedAsset, setAffectedAsset] = useState("");
  const [cvss, setCvss] = useState("");
  const [cweId, setCweId] = useState("");
  const [description, setDescription] = useState("");
  const [reproSteps, setReproSteps] = useState("");
  const [attachments, setAttachments] = useState<UploadOut[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!programId) return;
    apiGet<ProgramDetail>(`/programs/${programId}`)
      .then(setProgram)
      .catch((e) => setError(errMessage(e)));
  }, [programId]);

  if (loading || !me) return <FullPageLoader />;
  if (error && !program) {
    return (
      <AppShell me={me}>
        <main>
          <ErrorAlert>{error}</ErrorAlert>
        </main>
      </AppShell>
    );
  }
  if (!program) return <FullPageLoader label="Loading program…" />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      const created = await apiPost<Report>("/reports", {
        program_id: programId,
        title,
        severity,
        cvss: cvss || undefined,
        cwe_id: cweId || undefined,
        affected_asset: affectedAsset || undefined,
        description,
        repro_steps: reproSteps,
        attachments: attachments.map(({ key, name }) => ({ key, name })),
      });
      router.push(`/researcher/reports/${created.id}`);
    } catch (err) {
      setFormError(errMessage(err));
      setSubmitting(false);
    }
  }

  const acceptingReports = program.status === "active";

  return (
    <AppShell me={me}>
      <main className="mx-auto max-w-3xl">
        <Link
          href={`/researcher/programs/${programId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {program.name}
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Submit a report</CardTitle>
            <CardDescription>
              To {program.name}. Include as much detail as possible — quality reports are triaged faster.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!acceptingReports && (
              <div className="mb-4">
                <InfoAlert>
                  This program is not accepting reports right now (status: {program.status}).
                </InfoAlert>
              </div>
            )}

              <form onSubmit={onSubmit} className="space-y-4">
                {formError && <ErrorAlert>{formError}</ErrorAlert>}

                <div className="space-y-1.5">
                  <Label htmlFor="report-title">Title *</Label>
                  <Input
                    id="report-title"
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Short, descriptive summary"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="report-severity">Severity *</Label>
                    <Select
                      id="report-severity"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {titleCase(s)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="report-asset">Affected asset</Label>
                    <Input
                      id="report-asset"
                      value={affectedAsset}
                      onChange={(e) => setAffectedAsset(e.target.value)}
                      placeholder="e.g. api.example.com/v1/login"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="report-cvss">CVSS vector (optional)</Label>
                  <Input
                    id="report-cvss"
                    value={cvss}
                    onChange={(e) => setCvss(e.target.value)}
                    placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
                    className="font-mono text-xs"
                  />
                  <CvssCalculator value={cvss} onChange={setCvss} onApplySeverity={setSeverity} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="report-cwe">Type of bug</Label>
                  <Select
                    id="report-cwe"
                    value={cweId}
                    onChange={(e) => setCweId(e.target.value)}
                  >
                    <option value="">Not sure / other</option>
                    {cweList.map((cwe) => (
                      <option key={cwe.id} value={cwe.id}>
                        {cwe.id} — {cwe.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="report-description">Description *</Label>
                  <Textarea
                    id="report-description"
                    rows={5}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is the vulnerability and what is the impact?"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="report-repro">Reproduction steps</Label>
                  <Textarea
                    id="report-repro"
                    rows={5}
                    value={reproSteps}
                    onChange={(e) => setReproSteps(e.target.value)}
                    placeholder={"1. Go to …\n2. Send request …\n3. Observe …"}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Attachments</Label>
                  <AttachmentsPicker value={attachments} onChange={setAttachments} disabled={submitting} />
                </div>

                <Button type="submit" className="w-full" disabled={submitting || !acceptingReports}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit report
                </Button>
              </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
