"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Lock, Pencil, Paperclip } from "lucide-react";
import { apiGet, apiPatch, apiPost, errMessage } from "@/lib/api";
import { REPORT_EDITABLE_STATUSES, SEVERITIES } from "@/lib/constants";
import { fmtDateTime, titleCase } from "@/lib/utils";
import type { Comment, Report, UploadOut } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/alerts";
import { ReportStatusBadge, SeverityBadge } from "@/components/badges";
import { AttachmentsPicker } from "@/components/attachments";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import cweList from "@/lib/cwe_list.json";

export default function ResearcherReportPage() {
  const { me, loading: meLoading } = useMe("researcher");
  const params = useParams<{ id: string }>();
  const reportId = typeof params?.id === "string" ? params.id : "";

  const [report, setReport] = useState<Report | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");

  // Edit form
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [affectedAsset, setAffectedAsset] = useState("");
  const [cvss, setCvss] = useState("");
  const [cweId, setCweId] = useState("");
  const [description, setDescription] = useState("");
  const [reproSteps, setReproSteps] = useState("");
  const [attachments, setAttachments] = useState<UploadOut[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Comment composer
  const [body, setBody] = useState("");
  const [commentAttachments, setCommentAttachments] = useState<UploadOut[]>([]);
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState("");

  const loadComments = useCallback(() => {
    apiGet<Comment[]>(`/reports/${reportId}/comments`)
      .then(setComments)
      .catch((e) => setCommentError(errMessage(e)));
  }, [reportId]);

  useEffect(() => {
    if (!reportId) return;
    apiGet<Report>(`/reports/${reportId}`)
      .then(setReport)
      .catch((e) => setError(errMessage(e)));
    loadComments();
  }, [reportId, loadComments]);

  function startEditing() {
    if (!report) return;
    setTitle(report.title);
    setSeverity(report.severity);
    setAffectedAsset(report.affected_asset ?? "");
    setCvss(report.cvss ?? "");
    setCweId(report.cwe_id ?? "");
    setDescription(report.description);
    setReproSteps(report.repro_steps);
    setAttachments(report.attachments.map((a) => ({ key: a.key, name: a.name, url: a.url })));
    setEditError("");
    setNotice("");
    setEditing(true);
  }

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

  const editable = (REPORT_EDITABLE_STATUSES as readonly string[]).includes(report.status);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setEditError("");
    try {
      const updated = await apiPatch<Report>(`/reports/${reportId}`, {
        title,
        severity,
        cvss: cvss || null,
        cwe_id: cweId || null,
        affected_asset: affectedAsset || null,
        description,
        repro_steps: reproSteps,
        attachments: attachments.map(({ key, name }) => ({ key, name })),
      });
      setReport(updated);
      setEditing(false);
      setNotice("Report updated.");
    } catch (err) {
      setEditError(errMessage(err));
    } finally {
      setSaving(false);
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
        attachments: commentAttachments.map(({ key, name }) => ({ key, name })),
      });
      setComments((prev) => [...(prev ?? []), created]);
      setBody("");
      setCommentAttachments([]);
    } catch (err) {
      setCommentError(errMessage(err));
    } finally {
      setPosting(false);
    }
  }

  return (
    <AppShell me={me}>
      <main>
        <Link
          href="/researcher"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          My workspace
        </Link>

        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{report.title}</h1>
          <SeverityBadge severity={report.severity} />
          <ReportStatusBadge status={report.status} />
        </div>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          In{" "}
          <Link
            href={`/researcher/programs/${report.program_id}`}
            className="font-medium text-indigo-600 hover:underline"
          >
            {report.program_name}
          </Link>{" "}
          · submitted {fmtDateTime(report.created_at)} · updated {fmtDateTime(report.updated_at)}
        </p>

        {notice && <div className="mb-4"><SuccessAlert>{notice}</SuccessAlert></div>}

        {!editable && !editing && (
          <div className="mb-4">
            <InfoAlert>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                This report is locked — triage has moved it past the editable stage, so it
                can no longer be edited. Use the comments below to add information.
              </span>
            </InfoAlert>
          </div>
        )}

        {editing ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Edit report</CardTitle>
              <CardDescription>
                Editable while the report is in “new” or “triaging” status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSave} className="space-y-4">
                {editError && <ErrorAlert>{editError}</ErrorAlert>}

                <div className="space-y-1.5">
                  <Label htmlFor="edit-title">Title *</Label>
                  <Input
                    id="edit-title"
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-severity">Severity *</Label>
                    <Select
                      id="edit-severity"
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
                    <Label htmlFor="edit-asset">Affected asset</Label>
                    <Input
                      id="edit-asset"
                      value={affectedAsset}
                      onChange={(e) => setAffectedAsset(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-cwe">Type of bug</Label>
                  <Select id="edit-cwe" value={cweId} onChange={(e) => setCweId(e.target.value)}>
                    <option value="">Not sure / other</option>
                    {cweList.map((cwe) => (
                      <option key={cwe.id} value={cwe.id}>
                        {cwe.id} — {cwe.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-cvss">CVSS vector (optional)</Label>
                  <Input
                    id="edit-cvss"
                    value={cvss}
                    onChange={(e) => setCvss(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-description">Description *</Label>
                  <Textarea
                    id="edit-description"
                    rows={5}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-repro">Reproduction steps</Label>
                  <Textarea
                    id="edit-repro"
                    rows={5}
                    value={reproSteps}
                    onChange={(e) => setReproSteps(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Attachments</Label>
                  <AttachmentsPicker value={attachments} onChange={setAttachments} disabled={saving} />
                </div>

                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="mb-6 space-y-6">
            {editable && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit report
                </Button>
              </div>
            )}

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
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-300">
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
                          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                            {attachment.name}
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
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Affected asset
                    </dt>
                    <dd className="mt-0.5 break-all text-sm text-slate-800 dark:text-slate-200">
                      {report.affected_asset || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      CVSS
                    </dt>
                    <dd className="mt-0.5 break-all font-mono text-xs text-slate-800 dark:text-slate-200">
                      {report.cvss || "—"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Comments</CardTitle>
            <CardDescription>Messages between you and the triage team.</CardDescription>
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
                  className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{comment.author_name}</span>
                    <Badge color={comment.author_kind === "staff" ? "indigo" : "slate"}>
                      {titleCase(comment.author_kind)}
                    </Badge>
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
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white px-2 py-1 text-xs font-medium text-indigo-600 hover:underline dark:border-slate-700 dark:bg-slate-900 dark:text-indigo-300"
                          >
                            <Paperclip className="h-3 w-3" />
                            {attachment.name}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span
                            key={attachment.key}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white px-2 py-1 text-xs text-slate-600 dark:text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
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
                placeholder="Add a comment…"
              />
              <AttachmentsPicker
                value={commentAttachments}
                onChange={setCommentAttachments}
                disabled={posting}
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={posting || !body.trim()}>
                  {posting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Comment
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
