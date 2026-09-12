"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Paperclip } from "lucide-react";
import { apiGet, apiPatch, apiPost, errMessage } from "@/lib/api";
import { REPORT_STATUSES } from "@/lib/constants";
import { fmtDateTime, titleCase } from "@/lib/utils";
import type { Comment, Report, StaffMember, UploadOut } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, SuccessAlert } from "@/components/alerts";
import { ReportStatusBadge, SeverityBadge } from "@/components/badges";
import { AttachmentsPicker } from "@/components/attachments";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function ReportDetailPage() {
  const { me, loading: meLoading } = useMe("staff");
  const params = useParams<{ id: string }>();
  const reportId = typeof params?.id === "string" ? params.id : "";

  const [report, setReport] = useState<Report | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[] | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState("");

  // Triage form
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [savingTriage, setSavingTriage] = useState(false);
  const [triageNotice, setTriageNotice] = useState("");
  const [triageError, setTriageError] = useState("");

  // Comment composer
  const [body, setBody] = useState("");
  const [internalOnly, setInternalOnly] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<UploadOut[]>([]);
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState("");

  const loadReport = useCallback(() => {
    return apiGet<Report>(`/reports/${reportId}`)
      .then(setReport)
      .catch((e) => setError(errMessage(e)));
  }, [reportId]);

  const loadComments = useCallback(() => {
    apiGet<Comment[]>(`/reports/${reportId}/comments`)
      .then(setComments)
      .catch((e) => setCommentError(errMessage(e)));
  }, [reportId]);

  useEffect(() => {
    if (!reportId) return;
    loadReport();
    loadComments();
    // Staff list is org-admin-only; triagers/viewers fall back to plain text assignee.
    apiGet<StaffMember[]>("/staff")
      .then(setStaffList)
      .catch(() => setStaffList(null));
  }, [reportId, loadReport, loadComments]);

  // Sync triage form whenever the report changes.
  useEffect(() => {
    if (report) {
      setStatus(report.status);
      setAssignee(report.assigned_staff_id ?? "");
    }
  }, [report]);

  if (meLoading || !me) return <FullPageLoader />;
  if (error && !report) {
    return (
      <AppShell me={me}>
        <main>
          <ErrorAlert>{error}</ErrorAlert>
        </main>
      </AppShell>
    );
  }
  if (!report) return <FullPageLoader label="Loading report…" />;

  async function onTriageSave() {
    if (!report) return;
    setSavingTriage(true);
    setTriageNotice("");
    setTriageError("");
    try {
      const payload: { status?: string; assigned_staff_id?: string | null } = {};
      if (status && status !== report.status) payload.status = status;
      if ((report.assigned_staff_id ?? "") !== assignee) {
        payload.assigned_staff_id = assignee === "" ? null : assignee;
      }
      if (Object.keys(payload).length === 0) {
        setTriageNotice("No changes to save.");
        return;
      }
      const updated = await apiPatch<Report>(`/reports/${report.id}/triage`, payload);
      setReport(updated);
      setTriageNotice("Triage updated.");
    } catch (err) {
      setTriageError(errMessage(err));
    } finally {
      setSavingTriage(false);
    }
  }

  async function onCommentSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setCommentError("");
    try {
      const created = await apiPost<Comment>(`/reports/${reportId}/comments`, {
        body,
        internal_only: internalOnly,
        attachments: commentAttachments.map(({ key, name }) => ({ key, name })),
      });
      setComments((prev) => [...(prev ?? []), created]);
      setBody("");
      setInternalOnly(false);
      setCommentAttachments([]);
    } catch (err) {
      setCommentError(errMessage(err));
    } finally {
      setPosting(false);
    }
  }

  const dirty =
    (report && status !== report.status) ||
    (report && (report.assigned_staff_id ?? "") !== assignee);

  return (
    <AppShell me={me}>
      <main>
        <Link
          href={`/programs/${report.program_id}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {report.program_name}
        </Link>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{report.title}</h1>
          <SeverityBadge severity={report.severity} />
          <ReportStatusBadge status={report.status} />
          <span
            className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700"
            title="Reference code quoted by the submitter (e.g. from the public form)"
          >
            REF {report.reference}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                {report.description ? (
                  <Markdown content={report.description} />
                ) : (
                  <p className="text-sm italic text-slate-400">No description provided.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reproduction steps</CardTitle>
              </CardHeader>
              <CardContent>
                {report.repro_steps ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                    {report.repro_steps}
                  </pre>
                ) : (
                  <p className="text-sm italic text-slate-400">Not provided.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Attachments</CardTitle>
              </CardHeader>
              <CardContent>
                {report.attachments.length === 0 ? (
                  <p className="text-sm italic text-slate-400">No attachments.</p>
                ) : (
                  <ul className="space-y-2">
                    {report.attachments.map((attachment, index) => (
                      <li key={`${attachment.key}-${index}`} className="text-sm">
                        {attachment.url ? (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-medium text-indigo-600 hover:underline"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            {attachment.name}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-600">
                            <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                            {attachment.name}
                            <span className="text-xs text-slate-400">
                              (no preview URL — storage may not be configured)
                            </span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comments</CardTitle>
                <CardDescription>
                  Internal comments are never visible to the researcher.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {commentError && <ErrorAlert>{commentError}</ErrorAlert>}

                {comments && comments.length === 0 && (
                  <p className="text-sm italic text-slate-400">No comments yet.</p>
                )}

                <ul className="space-y-3">
                  {(comments ?? []).map((comment) => (
                    <li
                      key={comment.id}
                      className={`rounded-lg border p-3 ${
                        comment.internal_only
                          ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{comment.author_name}</span>
                        <Badge color={comment.author_kind === "staff" ? "indigo" : "slate"}>
                          {titleCase(comment.author_kind)}
                        </Badge>
                        {comment.internal_only && <Badge color="amber">Internal</Badge>}
                        <span>{fmtDateTime(comment.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{comment.body}</p>
                      {comment.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {comment.attachments.map((attachment) =>
                            attachment.url ? (
                              <a
                                key={attachment.key}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-indigo-600 hover:underline dark:border-slate-700 dark:bg-slate-900 dark:text-indigo-300"
                              >
                                <Paperclip className="h-3 w-3" />
                                {attachment.name}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span
                                key={attachment.key}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                              >
                                <Paperclip className="h-3 w-3" />
                                {attachment.name}
                              </span>
                            )
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                <form onSubmit={onCommentSubmit} className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <Textarea
                    rows={3}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write a comment…"
                  />
                  <AttachmentsPicker
                    value={commentAttachments}
                    onChange={setCommentAttachments}
                    disabled={posting}
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={internalOnly}
                        onChange={(e) => setInternalOnly(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Internal only (not visible to the researcher)
                    </label>
                    <Button type="submit" size="sm" disabled={posting || !body.trim()}>
                      {posting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Comment
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Triage</CardTitle>
                <CardDescription>Move status and assign a staff member.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {triageNotice && <SuccessAlert>{triageNotice}</SuccessAlert>}
                {triageError && <ErrorAlert>{triageError}</ErrorAlert>}

                <div className="space-y-1.5">
                  <Label htmlFor="triage-status">Status</Label>
                  <Select
                    id="triage-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {REPORT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {titleCase(s)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="triage-assignee">Assignee</Label>
                  {staffList ? (
                    <Select
                      id="triage-assignee"
                      value={assignee}
                      onChange={(e) => setAssignee(e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || s.email} ({s.email})
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {report.assigned_staff_name ?? "Unassigned"}
                      <span className="mt-0.5 block text-xs text-slate-400">
                        Assignee changes require the staff directory (org admin).
                      </span>
                    </p>
                  )}
                </div>

                <Button
                  onClick={onTriageSave}
                  disabled={savingTriage || !dirty}
                  className="w-full"
                >
                  {savingTriage && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save triage
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Researcher
                    </dt>
                    <dd className="mt-0.5 text-slate-800">{report.researcher_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Affected asset
                    </dt>
                    <dd className="mt-0.5 break-all text-slate-800">
                      {report.affected_asset || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      CVSS
                    </dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-slate-800">
                      {report.cvss || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Type of bug (CWE)
                    </dt>
                    <dd className="mt-0.5 text-slate-800">
                      {report.cwe_id ? `${report.cwe_id} — ${report.cwe_name}` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Created
                    </dt>
                    <dd className="mt-0.5 text-slate-800">{fmtDateTime(report.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Updated
                    </dt>
                    <dd className="mt-0.5 text-slate-800">{fmtDateTime(report.updated_at)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
