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
import { apiDelete, apiGet, apiPatch, apiPost, errMessage } from "@/lib/api";
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
  StaffMember,
} from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppHeader, FullPageLoader } from "@/components/shell";
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

type TabKey = "reports" | "invites" | "members" | "applications" | "roles" | "settings";

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
    { key: "invites", label: "Invites" },
    { key: "members", label: "Members" },
    { key: "applications", label: "Applications" },
    ...(isOrgAdmin ? [{ key: "roles" as TabKey, label: "Roles" }] : []),
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen">
      <AppHeader me={me} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
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

            <div className="mb-8 border-b border-slate-200">
              <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Program sections">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      tab === t.key
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }`}
                    aria-current={tab === t.key ? "page" : undefined}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            {tab === "reports" && <ReportsTab programId={programId} />}
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
    </div>
  );
}

/* ------------------------------ Reports tab ------------------------------ */

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-slate-900">
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
      (reports ?? []).filter(
        (r) =>
          (statusFilter === "all" || r.status === statusFilter) &&
          (severityFilter === "all" || r.severity === severityFilter)
      ),
    [reports, statusFilter, severityFilter]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total reports" value={stats?.total_reports} />
        <StatCard label="Members" value={stats?.members} />
        <StatCard label="Pending applications" value={stats?.pending_applications} />
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
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
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</span>
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
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {status === "all" ? "All" : status} ({count})
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
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
          <CardContent className="p-8 text-center text-sm text-slate-500">
            No reports submitted to this program yet.
          </CardContent>
        </Card>
      )}

      {reports && reports.length > 0 && filtered.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-slate-500">
            No reports match the current filters.
          </CardContent>
        </Card>
      )}

      {filtered.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell className="text-slate-600">{report.researcher_name}</TableCell>
                  <TableCell className="text-slate-600">
                    {report.assigned_staff_name ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500">
                    {fmtDate(report.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {!reports && !error && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reports…
        </div>
      )}
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
          <CardContent className="p-8 text-center text-sm text-slate-500">
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
                  <TableCell className="font-medium text-slate-800">{invite.email}</TableCell>
                  <TableCell>
                    <InviteStatusBadge invite={invite} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500">
                    {fmtDate(invite.created_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-500">
                    {fmtDate(invite.expires_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="max-w-[220px] truncate rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
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
        <div className="flex items-center gap-2 text-sm text-slate-500">
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
          <CardContent className="p-8 text-center text-sm text-slate-500">
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
                  <TableCell className="font-medium text-slate-800">{member.name}</TableCell>
                  <TableCell className="text-slate-600">{member.email}</TableCell>
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
        <div className="flex items-center gap-2 text-sm text-slate-500">
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
            <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">
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
          <CardContent className="p-8 text-center text-sm text-slate-500">
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
                    <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">
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
        <div className="flex items-center gap-2 text-sm text-slate-500">
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
          <CardContent className="p-8 text-center text-sm text-slate-500">
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
                  <TableCell className="font-medium text-slate-800">
                    {entry.staff_name || "—"}
                  </TableCell>
                  <TableCell className="text-slate-600">{entry.staff_email}</TableCell>
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
        <div className="flex items-center gap-2 text-sm text-slate-500">
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
            <p className="text-xs text-slate-500">
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
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs text-slate-700">{formLink}</code>
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
            <CardTitle>Scope preview</CardTitle>
            <CardDescription>Rendered markdown as researchers will see it.</CardDescription>
          </CardHeader>
          <CardContent>
            {scopeMarkdown.trim() ? (
              <Markdown content={scopeMarkdown} />
            ) : (
              <p className="text-sm italic text-slate-400">No scope defined yet.</p>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
