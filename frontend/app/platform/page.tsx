"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, errMessage } from "@/lib/api";
import { fmtDate, titleCase } from "@/lib/utils";
import type { Application, Program } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, SuccessAlert } from "@/components/alerts";
import { ResearcherStatusBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AdminResearcher {
  id: string;
  email: string;
  name: string;
  status: string;
  portfolio_url: string | null;
  has_account: boolean;
  reports: number;
  programs: number;
  is_staff: boolean;
}

function ResearchersPanel({ programs, onNotice }: { programs: Program[]; onNotice: (m: string) => void }) {
  const [rows, setRows] = useState<AdminResearcher[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [promoting, setPromoting] = useState<string | null>(null);
  const [role, setRole] = useState<"staff" | "triager">("triager");
  const [programId, setProgramId] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      apiGet<AdminResearcher[]>("/admin/researchers", { q })
        .then(setRows)
        .catch((e) => setError(errMessage(e)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  async function promote(r: AdminResearcher) {
    setError("");
    try {
      await apiPost(`/admin/researchers/${r.id}/promote`, {
        role,
        program_id: role === "triager" ? programId : undefined,
      });
      onNotice(`${r.email} can now sign in at /login as ${role === "triager" ? "a triager" : "staff"} with their existing password.`);
      setPromoting(null);
      setRows(await apiGet<AdminResearcher[]>("/admin/researchers", { q }));
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="max-w-md" />
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Researcher</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Programs</TableHead>
              <TableHead className="text-right">Reports</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.name || r.email}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{r.email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <ResearcherStatusBadge status={r.status} />
                    {!r.has_account && <Badge color="slate">no account</Badge>}
                    {r.is_staff && <Badge color="indigo">staff</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right">{r.programs}</TableCell>
                <TableCell className="text-right">{r.reports}</TableCell>
                <TableCell className="text-right">
                  {promoting === r.id ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Select value={role} onChange={(e) => setRole(e.target.value as "staff" | "triager")} className="w-28">
                        <option value="triager">Triager</option>
                        <option value="staff">Staff</option>
                      </Select>
                      {role === "triager" && (
                        <Select value={programId} onChange={(e) => setProgramId(e.target.value)} className="w-44">
                          <option value="">Program…</option>
                          {programs.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </Select>
                      )}
                      <Button size="sm" disabled={role === "triager" && !programId} onClick={() => promote(r)}>Confirm</Button>
                      <Button size="sm" variant="ghost" onClick={() => setPromoting(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!r.has_account || r.status === "banned"}
                      onClick={() => {
                        setPromoting(r.id);
                        setProgramId("");
                      }}
                    >
                      Promote
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows?.length === 0 && (
              <TableRow>
                <td colSpan={5} className="p-8 text-center text-slate-500">No researchers found.</td>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function ApplicationsPanel({ programs, onNotice }: { programs: Program[]; onNotice: (m: string) => void }) {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [filter, setFilter] = useState("pending");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiGet<Application[]>("/applications", { status: filter || undefined })
      .then(setApps)
      .catch((e) => setError(errMessage(e)));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const programName = (id: string | null) => programs.find((p) => p.id === id)?.name ?? "Any program";

  async function decide(app: Application, action: "approve" | "reject") {
    setError("");
    try {
      await apiPost(`/applications/${app.id}/${action}`, { program_id: app.program_id ? undefined : picked[app.id] });
      onNotice(action === "approve" ? `Approved ${app.email}; an invite was created.` : `Rejected ${app.email}.`);
      load();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40">
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
        <option value="">All</option>
      </Select>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <Card>
        {apps && apps.length === 0 ? (
          <CardContent className="p-8 text-center text-sm text-slate-500">No applications.</CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{a.name || a.email}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{a.email}</div>
                    {a.message && <div className="mt-1 max-w-sm text-xs">{a.message}</div>}
                  </TableCell>
                  <TableCell>
                    {a.program_id ? (
                      programName(a.program_id)
                    ) : a.status === "pending" ? (
                      <Select
                        value={picked[a.id] ?? ""}
                        onChange={(e) => setPicked((p) => ({ ...p, [a.id]: e.target.value }))}
                        className="w-44"
                      >
                        <option value="">Choose program…</option>
                        {programs.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{titleCase(a.status)}</TableCell>
                  <TableCell>{fmtDate(a.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {a.status === "pending" && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" disabled={!a.program_id && !picked[a.id]} onClick={() => decide(a, "approve")}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decide(a, "reject")}>Reject</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function PlatformPeoplePage() {
  const { me, loading } = useMe("staff");
  const [tab, setTab] = useState<"researchers" | "applications">("researchers");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [notice, setNotice] = useState("");

  const isSuper = me?.global_role === "super_admin";

  useEffect(() => {
    if (isSuper) apiGet<Program[]>("/programs").then(setPrograms).catch(() => setPrograms([]));
  }, [isSuper]);

  if (loading || !me) return <FullPageLoader />;
  if (!isSuper) {
    return (
      <AppShell me={me}>
        <ErrorAlert>Only super admins can view the platform directory.</ErrorAlert>
      </AppShell>
    );
  }

  return (
    <AppShell me={me}>
      <main className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Researchers &amp; applications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Platform-wide directory. Promoting gives a researcher a staff login with the same email and password.
          </p>
        </div>
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
          {(["researchers", "applications"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${
                tab === t ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {notice && <SuccessAlert>{notice}</SuccessAlert>}
        {tab === "researchers" ? (
          <ResearchersPanel programs={programs} onNotice={setNotice} />
        ) : (
          <ApplicationsPanel programs={programs} onNotice={setNotice} />
        )}
      </main>
    </AppShell>
  );
}
