"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Mail,
  Trash2,
  UserPlus,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, errMessage, postForm } from "@/lib/api";
import {
  PROGRAM_ROLES,
  PROGRAM_STATUSES,
  PROGRAM_VISIBILITIES,
  REPORT_STATUSES,
  SEVERITIES,
} from "@/lib/constants";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/utils";
import type {
  Application,
  Invite,
  Me,
  ProgramDetail,
  ProgramRoleEntry,
  ProgramStats,
  Report,
  Researcher,
  ScopeEntry,
  ScopeImportResult,
  StaffMember,
} from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/alerts";
import {
  InviteStatusBadge,
  ProgramRoleBadge,
  ProgramStatusBadge,
  ReportStatusBadge,
  ResearcherStatusBadge,
  SeverityBadge,
  VisibilityBadge,
} from "@/components/badges";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TabKey = "reports" | "scope" | "invites" | "members" | "applications" | "roles" | "settings";

export default function ProgramPage() {
  const { me, loading } = useMe("staff");
  const params = useParams<{ id: string }>();
  const programId = typeof params?.id === "string" ? params.id : "";

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("reports");

  useEffect(() => {
    if (!programId) return;
    apiGet<ProgramDetail>(`/programs/${programId}`)
      .then(setProgram)
      .catch((e) => setError(errMessage(e)));
  }, [programId]);

  if (loading || !me) return <FullPageLoader />;

  const isOrgAdmin = me.global_role === "super_admin" || me.global_role === "org_admin";

  const tabs: { key: TabKey; label: string }[] = [
    { key: "reports", label: "Reports" },
    { key: "scope", label: "Scope" },
    { key: "invites", label: "Invites" },
    { key: "members", label: "Members" },
    { key: "applications", label: "Applications" },
    ...(isOrgAdmin ? [{ key: "roles" as TabKey, label: "Roles" }] : []),
    { key: "settings", label: "Settings" },
  ];

  return (
    <AppShell me={me}>
      <main>
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          All programs
        </Link>

        {error && <ErrorAlert>{error}</ErrorAlert>}

        {!program && !error && <FullPageLoader label="Loading program…" />}

        {program && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
              <ProgramStatusBadge status={program.status} />
              <VisibilityBadge visibility={program.visibility} />
              <span className="text-sm text-slate-400">/{program.slug}</span>
            </div>

            <div className="mb-8 border-b border-slate-200 dark:border-slate-800">
              <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Program sections">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      tab === t.key
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-slate-500 dark:text-slate-400 hover:border-slate-300 hover:text-slate-700"
                    }`}
                    aria-current={tab === t.key ? "page" : undefined}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            {tab === "reports" && <ReportsTab programId={programId} />}
            {tab === "scope" && <ScopeTab programId={programId} />}
            {tab === "invites" && <InvitesTab programId={programId} />}
            {tab === "members" && <MembersTab programId={programId} />}
            {tab === "applications" && <ApplicationsTab programId={programId} />}
            {tab === "roles" && isOrgAdmin && <RolesTab programId={programId} />}
            {tab === "settings" && (
              <SettingsTab program={program} onSaved={setProgram} me={me} />
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}

/* ------------------------------ Reports tab ------------------------------ */

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {value === undefined ? "—" : value}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportsTab({ programId }: { programId: string }) {
  const [stats, setStats] = useState<ProgramStats | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiGet<ProgramStats>(`/programs/${programId}/stats`)
      .then(setStats)
      .catch((e) => setError(errMessage(e)));
    apiGet<Report[]>("/reports", { program_id: programId })
      .then(setReports)
      .catch((e) => setError(errMessage(e)));
  }, [programId]);

  const filtered = useMemo(
    () =>
      (reports ?? []).filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (severityFilter !== "all" && r.severity !== severityFilter) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const haystack = `${r.reference} ${r.title} ${r.researcher_name}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      }),
    [reports, statusFilter, severityFilter, search]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total reports" value={stats?.total_reports} />
        <StatCard label="Members" value={stats?.members} />
        <StatCard label="Pending applications" value={stats?.pending_applications} />
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              By status
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stats && Object.keys(stats.by_status).length > 0 ? (
                Object.entries(stats.by_status).map(([status, count]) => (
                  <ReportStatusBadge key={status} status={`${status} · ${count}`} />
                ))
              ) : (
                <span className="text-sm text-slate-400">—</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</span>
        {["all", ...REPORT_STATUSES].map((status) => {
          const count =
            status === "all"
              ? reports?.length ?? 0
              : stats?.by_status?.[status] ??
                (reports ?? []).filter((r) => r.status === status).length;
          const active = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                active
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {status === "all" ? "All" : status} ({count})
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, title, researcher…"
            aria-label="Search reports"
            className="h-8 w-56 text-xs"
          />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Severity
          </span>
          <Select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="h-8 w-36 text-xs"
            aria-label="Filter by severity"
          >
            <option value="all">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && <ErrorAlert>{error}</ErrorAlert>}

      {reports && reports.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No reports submitted to this program yet.
          </CardContent>
        </Card>
      )}

      {reports && reports.length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No reports match the current filters.
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Researcher</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                    {report.reference}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/reports/${report.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {report.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={report.severity} />
                  </TableCell>
                  <TableCell>
                    <ReportStatusBadge status={report.status} />
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">{report.researcher_name}</TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">
                    {report.assigned_staff_name ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {fmtDate(report.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {!reports && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reports…
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Scope tab ------------------------------- */

function ScopeTab({ programId }: { programId: string }) {
  const [entries, setEntries] = useState<ScopeEntry[] | null>(null);
  const [error, setError] = useState("");

  // add/edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [severityGuide, setSeverityGuide] = useState("");
  const [description, setDescription] = useState("");
  const [inScope, setInScope] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // csv import
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ScopeImportResult | null>(null);
  const [importError, setImportError] = useState("");

  const loadScope = useCallback(() => {
    apiGet<ScopeEntry[]>(`/programs/${programId}/scope`)
      .then(setEntries)
      .catch((e) => setError(errMessage(e)));
  }, [programId]);

  useEffect(() => {
    loadScope();
  }, [loadScope]);

  function resetForm() {
    setEditingId(null);
    setTarget("");
    setSeverityGuide("");
    setDescription("");
    setInScope(true);
    setFormError("");
  }

  function startEdit(entry: ScopeEntry) {
    setEditingId(entry.id);
    setTarget(entry.target);
    setSeverityGuide(entry.severity_guide ?? "");
    setDescription(entry.description);
    setInScope(entry.in_scope);
    setFormError("");
  }

  async function onFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        target,
        severity_guide: severityGuide || undefined,
        description,
        in_scope: inScope,
      };
      if (editingId) {
        await apiPatch(`/programs/${programId}/scope/${editingId}`, payload);
      } else {
        await apiPost(`/programs/${programId}/scope`, payload);
      }
      resetForm();
      loadScope();
    } catch (err) {
      setFormError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(entry: ScopeEntry) {
    if (!window.confirm(`Remove "${entry.target}" from the scope?`)) return;
    try {
      await apiDelete(`/programs/${programId}/scope/${entry.id}`);
      loadScope();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function onImport(event: React.FormEvent) {
    event.preventDefault();
    if (!csvFile) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const result = await postForm<ScopeImportResult>(
        `/programs/${programId}/scope/import`,
        csvFile
      );
      setImportResult(result);
      setCsvFile(null);
      loadScope();
    } catch (err) {
      setImportError(errMessage(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <InfoAlert>
        Structured scope items shown to researchers (and merged with the free-form scope
        markdown in Settings). Adding and editing requires the manage-scope permission — the
        API will reject changes otherwise.
      </InfoAlert>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{editingId ? "Edit scope entry" : "Add scope entry"}</CardTitle>
            <CardDescription>
              One asset or pattern per entry, e.g. <code>*.example.com</code> or an API path.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onFormSubmit} className="space-y-4">
              {formError && <ErrorAlert>{formError}</ErrorAlert>}

              <div className="space-y-1.5">
                <Label htmlFor="scope-target">Target *</Label>
                <Input
                  id="scope-target"
                  required
                  maxLength={200}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="*.example.com or api.example.com/v1/*"
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="scope-in">Scope</Label>
                  <Select
                    id="scope-in"
                    value={inScope ? "in" : "out"}
                    onChange={(e) => setInScope(e.target.value === "in")}
                  >
                    <option value="in">In scope</option>
                    <option value="out">Out of scope</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scope-guide">Severity guide</Label>
                  <Input
                    id="scope-guide"
                    maxLength={32}
                    value={severityGuide}
                    onChange={(e) => setSeverityGuide(e.target.value)}
                    placeholder="up to critical"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="scope-desc">Description</Label>
                <Textarea
                  id="scope-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this asset covers, exclusions, notes…"
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Save changes" : "Add entry"}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Scope entries</CardTitle>
            <CardDescription>
              Shown to program members on their submission page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && <ErrorAlert>{error}</ErrorAlert>}
            {entries && entries.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No structured scope entries yet — add one or import a CSV.
              </p>
            )}
            {entries && entries.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Severity guide</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{entry.target}</TableCell>
                      <TableCell>
                        {entry.in_scope ? (
                          <Badge color="green">In scope</Badge>
                        ) : (
                          <Badge color="slate">Out of scope</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-300">
                        {entry.severity_guide ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-slate-600 dark:text-slate-300" title={entry.description}>
                        {entry.description || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="mr-2 text-xs font-medium text-indigo-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(entry)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!entries && !error && (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading scope…
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import scope from CSV</CardTitle>
          <CardDescription>
            Header row required: <code>target</code> (column aliases: asset, host, url,
            domain); optional <code>description</code>, <code>in_scope</code>
            {" "}(<em>in/out, yes/no, true/false</em>), <code>severity_guide</code>. Rows
            without a target are skipped; existing targets are not duplicated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onImport} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              aria-label="CSV file to import"
            />
            <Button type="submit" variant="outline" disabled={!csvFile || importing}>
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              Import
            </Button>
          </form>
          {importResult && (
            <div className="mt-3">
              <SuccessAlert>
                Imported {importResult.created} entr{importResult.created === 1 ? "y" : "ies"}
                {importResult.skipped > 0 && ` · skipped ${importResult.skipped}`}
              </SuccessAlert>
            </div>
          )}
          {importError && (
            <div className="mt-3">
              <ErrorAlert>{importError}</ErrorAlert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ Invites tab ------------------------------ */

function InvitesTab({ programId }: { programId: string }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(() => {
    apiGet<Invite[]>(`/programs/${programId}/invites`)
      .then(setInvites)
      .catch((e) => setError(errMessage(e)));
  }, [programId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    setNotice("");
    try {
      await apiPost(`/programs/${programId}/invites`, { email });
      setEmail("");
      setNotice("Invite created. Share the link below with the researcher.");
      load();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(invite: Invite) {
    if (!window.confirm(`Revoke the invite for ${invite.email}?`)) return;
    setError("");
    try {
      await apiDelete(`/programs/${programId}/invites/${invite.id}`);
      load();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function onCopy(invite: Invite) {
    try {
      await navigator.clipboard.writeText(`${origin}/invite/${invite.token}`);
      setCopiedId(invite.id);
      window.setTimeout(() => setCopiedId((c) => (c === invite.id ? null : c)), 2000);
    } catch {
      setError("Could not copy to clipboard — copy the link manually.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create invite</CardTitle>
          <CardDescription>
            The researcher activates their account via the invite link (valid for the
            configured TTL).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="flex max-w-md items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="invite-email">Researcher email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="researcher@example.com"
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Invite
            </Button>
          </form>
        </CardContent>
      </Card>

      {notice && <SuccessAlert>{notice}</SuccessAlert>}
      {error && <ErrorAlert>{error}</ErrorAlert>}

      {invites && invites.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No invites created yet.
          </CardContent>
        </Card>
      )}

      {invites && invites.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Invite link</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell className="font-medium text-slate-800 dark:text-slate-200">{invite.email}</TableCell>
                  <TableCell>
                    <InviteStatusBadge invite={invite} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {fmtDate(invite.created_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {fmtDate(invite.expires_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="max-w-[220px] truncate rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs text-slate-600 dark:text-slate-300">
                        {origin}/invite/{invite.token}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Copy invite link"
                        onClick={() => onCopy(invite)}
                      >
                        {copiedId === invite.id ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {!invite.revoked && !invite.accepted_at && (
                      <Button variant="ghost" size="sm" onClick={() => onRevoke(invite)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {!invites && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading invites…
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Members tab ------------------------------ */

function MembersTab({ programId }: { programId: string }) {
  const [members, setMembers] = useState<Researcher[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiGet<Researcher[]>(`/programs/${programId}/members`)
      .then(setMembers)
      .catch((e) => setError(errMessage(e)));
  }, [programId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRemove(member: Researcher) {
    if (!window.confirm(`Remove ${member.email} from this program?`)) return;
    setError("");
    try {
      await apiDelete(`/programs/${programId}/members/${member.id}`);
      load();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      {error && <ErrorAlert>{error}</ErrorAlert>}

      {members && members.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No members yet. Invite researchers from the Invites tab.
          </CardContent>
        </Card>
      )}

      {members && members.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium text-slate-800 dark:text-slate-200">{member.name}</TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">{member.email}</TableCell>
                  <TableCell>
                    <ResearcherStatusBadge status={member.status} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => onRemove(member)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {!members && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading members…
        </div>
      )}
    </div>
  );
}

/* --------------------------- Applications tab ---------------------------- */

function ApplicationsTab({ programId }: { programId: string }) {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approved, setApproved] = useState<Invite | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(() => {
    apiGet<Application[]>("/applications", {
      status: "pending",
      program_id: programId,
    })
      .then(setApps)
      .catch((e) => setError(errMessage(e)));
  }, [programId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onApprove(app: Application) {
    setBusyId(app.id);
    setError("");
    try {
      const invite = await apiPost<Invite>(`/applications/${app.id}/approve`, {});
      setApproved(invite);
      load();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(app: Application) {
    if (!window.confirm(`Reject the application from ${app.email}?`)) return;
    setBusyId(app.id);
    setError("");
    try {
      await apiPost(`/applications/${app.id}/reject`, {});
      load();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {approved && (
        <SuccessAlert>
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Invite created for <strong>{approved.email}</strong>. Share their invite link:
            </span>
            <code className="rounded bg-white dark:bg-slate-900/70 px-1.5 py-0.5 text-xs">
              {origin}/invite/{approved.token}
            </code>
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium underline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${origin}/invite/${approved.token}`);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                } catch {
                  // clipboard unavailable
                }
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </SuccessAlert>
      )}

      {error && <ErrorAlert>{error}</ErrorAlert>}

      {apps && apps.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No pending applications for this program.
          </CardContent>
        </Card>
      )}

      {apps && apps.length > 0 && (
        <div className="space-y-3">
          {apps.map((app) => (
            <Card key={app.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle>{app.name || app.email}</CardTitle>
                    <CardDescription>
                      {app.email} · applied {fmtDateTime(app.created_at)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === app.id}
                      onClick={() => onApprove(app)}
                    >
                      {busyId === app.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                      disabled={busyId === app.id}
                      onClick={() => onReject(app)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {(app.message || app.portfolio_url) && (
                <CardContent className="space-y-2">
                  {app.message && (
                    <p className="whitespace-pre-wrap rounded-md bg-slate-50 dark:bg-slate-800/60 p-3 text-sm text-slate-700 dark:text-slate-300">
                      {app.message}
                    </p>
                  )}
                  {app.portfolio_url && (
                    <a
                      href={app.portfolio_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-sm font-medium text-indigo-600 hover:underline"
                    >
                      {app.portfolio_url}
                    </a>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {!apps && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading applications…
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Roles tab ------------------------------- */

function RolesTab({ programId }: { programId: string }) {
  const [roles, setRoles] = useState<ProgramRoleEntry[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState<string>("triager");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    apiGet<ProgramRoleEntry[]>(`/programs/${programId}/roles`)
      .then(setRoles)
      .catch((e) => setError(errMessage(e)));
  }, [programId]);

  useEffect(() => {
    load();
    apiGet<StaffMember[]>("/staff")
      .then(setStaff)
      .catch(() => setStaff([])); // non-org-admins cannot list staff; tab is hidden for them anyway
  }, [load]);

  async function onAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!staffId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiPost(`/programs/${programId}/roles`, { staff_id: staffId, role });
      setStaffId("");
      setNotice("Role saved. Assigning an existing member updates their role.");
      load();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(entry: ProgramRoleEntry) {
    if (!window.confirm(`Remove ${entry.staff_email} from this program?`)) return;
    setError("");
    try {
      await apiDelete(`/programs/${programId}/roles/${entry.id}`);
      load();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Assign program role</CardTitle>
          <CardDescription>
            Owners manage scope, invites and triage; triagers triage and view; viewers
            can only view reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAssign} className="flex max-w-xl flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="role-staff">Staff member</Label>
              <Select
                id="role-staff"
                required
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              >
                <option value="" disabled>
                  Select staff…
                </option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.email} ({s.email})
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40 space-y-1.5">
              <Label htmlFor="role-value">Role</Label>
              <Select id="role-value" value={role} onChange={(e) => setRole(e.target.value)}>
                {PROGRAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {titleCase(r)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={saving || !staffId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Assign
            </Button>
          </form>
        </CardContent>
      </Card>

      {notice && <SuccessAlert>{notice}</SuccessAlert>}
      {error && <ErrorAlert>{error}</ErrorAlert>}

      {roles && roles.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No staff assigned to this program yet.
          </CardContent>
        </Card>
      )}

      {roles && roles.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium text-slate-800 dark:text-slate-200">
                    {entry.staff_name || "—"}
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">{entry.staff_email}</TableCell>
                  <TableCell>
                    <ProgramRoleBadge role={entry.role} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => onRemove(entry)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {!roles && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading roles…
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Settings tab ------------------------------ */

/** Toggle for the shareable, unauthenticated report form (/report/{slug}). */
function PublicReportingCard({
  program,
  onSaved,
}: {
  program: ProgramDetail;
  onSaved: (program: ProgramDetail) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const formLink =
    typeof window !== "undefined" ? `${window.location.origin}/report/${program.slug}` : `/report/${program.slug}`;

  async function toggle(next: boolean) {
    setSaving(true);
    setError("");
    try {
      const updated = await apiPatch<ProgramDetail>(`/programs/${program.id}`, {
        public_reporting: next,
      });
      onSaved(updated);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(formLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. insecure context); user can select the text instead
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public report form</CardTitle>
        <CardDescription>
          A shareable, unauthenticated submission form. Reporters can file anonymously or with
          just a contact email — no account or membership required. The form only accepts
          submissions while the program is active.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="public-reporting-toggle">Enable public reporting</Label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {program.public_reporting
                ? "Enabled — anyone with the link can submit."
                : "Disabled — only program members can submit reports."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            <Switch
              id="public-reporting-toggle"
              checked={program.public_reporting}
              onCheckedChange={toggle}
              disabled={saving}
            />
          </div>
        </div>

        {program.public_reporting && (
          <div className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-300">{formLink}</code>
            <Button type="button" variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        )}

        {error && <ErrorAlert>{error}</ErrorAlert>}
      </CardContent>
    </Card>
  );
}

function SettingsTab({
  program,
  onSaved,
  me,
}: {
  program: ProgramDetail;
  onSaved: (program: ProgramDetail) => void;
  me: Me;
}) {
  const [name, setName] = useState(program.name);
  const [description, setDescription] = useState(program.description);
  const [status, setStatus] = useState(program.status);
  const [visibility, setVisibility] = useState(program.visibility);
  const [scopeMarkdown, setScopeMarkdown] = useState(program.scope_markdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const canManage = me.global_role === "super_admin" || me.global_role === "org_admin";

  useEffect(() => {
    setName(program.name);
    setDescription(program.description);
    setStatus(program.status);
    setVisibility(program.visibility);
    setScopeMarkdown(program.scope_markdown);
  }, [program]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await apiPatch<ProgramDetail>(`/programs/${program.id}`, {
        name,
        description,
        status,
        visibility,
        scope_markdown: scopeMarkdown,
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {!canManage && (
        <InfoAlert>
          Saving requires the manage-scope permission (org admin or program owner). If
          you lack it, the API will reject the change.
        </InfoAlert>
      )}

      {saved && <SuccessAlert>Program updated.</SuccessAlert>}
      {error && <ErrorAlert>{error}</ErrorAlert>}

      <PublicReportingCard program={program} onSaved={onSaved} />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Program settings</CardTitle>
            <CardDescription>
              Slug: /{program.slug} · created {fmtDate(program.created_at)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="settings-name">Name</Label>
              <Input
                id="settings-name"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="settings-status">Status</Label>
                <Select
                  id="settings-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {PROGRAM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settings-visibility">Visibility</Label>
                <Select
                  id="settings-visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  {PROGRAM_VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {titleCase(v)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-description">Description</Label>
              <Textarea
                id="settings-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-scope">Scope (markdown)</Label>
              <Textarea
                id="settings-scope"
                rows={12}
                className="font-mono text-xs"
                value={scopeMarkdown}
                onChange={(e) => setScopeMarkdown(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              Rendered markdown as researchers and visitors will see it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Description
              </p>
              {description.trim() ? (
                <Markdown content={description} />
              ) : (
                <p className="text-sm italic text-slate-400">No description yet.</p>
              )}
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Scope
              </p>
              {scopeMarkdown.trim() ? (
                <Markdown content={scopeMarkdown} />
              ) : (
                <p className="text-sm italic text-slate-400">No scope defined yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
