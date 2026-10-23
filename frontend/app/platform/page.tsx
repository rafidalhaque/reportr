"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, errMessage } from "@/lib/api";
import { fmtDate, titleCase } from "@/lib/utils";
import type { Application, ApplicationAnswer, ApplicationField, Program } from "@/lib/types";
import { AnswersList } from "@/components/answers";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, SuccessAlert } from "@/components/alerts";
import { ResearcherStatusBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AdminResearcher {
  id: string;
  email: string;
  name: string;
  status: string;
  answers: ApplicationAnswer[];
  has_account: boolean;
  reports: number;
  programs: number;
  is_staff: boolean;
}

interface AdminMembership {
  program_id: string;
  program_name: string;
  program_status: string;
  joined_at: string;
}

/** Everything a program can do with a researcher, available to the super admin for any program. */
function ManagePanel({
  researcher,
  programs,
  onChanged,
  onNotice,
}: {
  researcher: AdminResearcher;
  programs: Program[];
  onChanged: () => void;
  onNotice: (m: string) => void;
}) {
  const [memberships, setMemberships] = useState<AdminMembership[] | null>(null);
  const [programId, setProgramId] = useState("");
  const [mode, setMode] = useState<"assign" | "invite">("assign");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiGet<AdminMembership[]>(`/admin/researchers/${researcher.id}/memberships`)
      .then(setMemberships)
      .catch((e) => setError(errMessage(e)));
  }, [researcher.id]);

  useEffect(() => {
    load();
  }, [load]);

  const memberOf = new Set(memberships?.map((m) => m.program_id));
  const available = programs.filter((p) => !memberOf.has(p.id) && p.status !== "suspended");

  async function add() {
    setError("");
    try {
      if (mode === "assign") {
        await apiPost(`/admin/researchers/${researcher.id}/memberships`, { program_id: programId });
        onNotice(`${researcher.email} was added to the program.`);
      } else {
        await apiPost(`/programs/${programId}/invites`, { email: researcher.email });
        onNotice(`Invite sent to ${researcher.email}.`);
      }
      setProgramId("");
      load();
      onChanged();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function remove(m: AdminMembership) {
    if (!window.confirm(`Remove ${researcher.email} from ${m.program_name}?`)) return;
    setError("");
    try {
      await apiDelete(`/admin/researchers/${researcher.id}/memberships/${m.program_id}`);
      load();
      onChanged();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function setStatus(status: "active" | "banned") {
    setError("");
    try {
      await apiPatch(`/admin/researchers/${researcher.id}`, { status });
      onNotice(`${researcher.email} is now ${status}.`);
      onChanged();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <div className="space-y-4 p-4">
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {researcher.answers.length > 0 && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Profile</div>
          <AnswersList answers={researcher.answers} />
        </div>
      )}
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Programs</div>
        {memberships && memberships.length === 0 && (
          <p className="text-sm text-slate-500">Not a member of any program.</p>
        )}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {memberships?.map((m) => (
            <li key={m.program_id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span>
                {m.program_name} <span className="text-xs text-slate-500">since {fmtDate(m.joined_at)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => remove(m)}>Remove</Button>
            </li>
          ))}
        </ul>
      </div>
      {researcher.has_account && researcher.status !== "banned" && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={mode} onChange={(e) => setMode(e.target.value as "assign" | "invite")} className="w-44">
            <option value="assign">Add directly</option>
            <option value="invite">Send invite</option>
          </Select>
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)} className="w-56">
            <option value="">Program…</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Button size="sm" disabled={!programId} onClick={add}>Add to program</Button>
        </div>
      )}
      {researcher.has_account && (
        <div>
          {researcher.status === "banned" ? (
            <Button size="sm" variant="outline" onClick={() => setStatus("active")}>Reinstate researcher</Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => setStatus("banned")}>Ban researcher</Button>
          )}
        </div>
      )}
    </div>
  );
}

function ResearchersPanel({ programs, onNotice }: { programs: Program[]; onNotice: (m: string) => void }) {
  const [rows, setRows] = useState<AdminResearcher[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [promoting, setPromoting] = useState<string | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const [role, setRole] = useState<"staff" | "triager">("triager");
  const [programId, setProgramId] = useState("");

  const refresh = useCallback(() => {
    apiGet<AdminResearcher[]>("/admin/researchers", { q })
      .then(setRows)
      .catch((e) => setError(errMessage(e)));
  }, [q]);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 250);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function promote(r: AdminResearcher) {
    setError("");
    try {
      await apiPost(`/admin/researchers/${r.id}/promote`, {
        role,
        program_id: role === "triager" ? programId : undefined,
      });
      onNotice(`${r.email} can now sign in at /login as ${role === "triager" ? "a triager" : "staff"} with their existing password.`);
      setPromoting(null);
      refresh();
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
              <Fragment key={r.id}>
              <TableRow>
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-2"
                    onClick={() => setManaging(managing === r.id ? null : r.id)}
                  >
                    Manage
                  </Button>
                </TableCell>
              </TableRow>
              {managing === r.id && (
                <TableRow>
                  <td colSpan={5} className="bg-slate-50 dark:bg-slate-900/50">
                    <ManagePanel researcher={r} programs={programs} onChanged={refresh} onNotice={onNotice} />
                  </td>
                </TableRow>
              )}
              </Fragment>
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

const FIELD_TYPES = ["text", "textarea", "dropdown", "checkbox", "url", "number"] as const;

/** Super admin: define the extra questions on the researcher application form. */
function FormFieldsPanel() {
  const [fields, setFields] = useState<ApplicationField[] | null>(null);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<(typeof FIELD_TYPES)[number]>("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [helpText, setHelpText] = useState("");

  const load = useCallback(() => {
    apiGet<ApplicationField[]>("/admin/application-fields")
      .then(setFields)
      .catch((e) => setError(errMessage(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      load();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      await apiPost("/admin/application-fields", {
        label,
        field_type: fieldType,
        required,
        options: fieldType === "dropdown" ? options.split("\n") : [],
        help_text: helpText,
      });
      setLabel("");
      setOptions("");
      setHelpText("");
      setRequired(false);
    });
  }

  function move(index: number, delta: number) {
    const a = fields?.[index];
    const b = fields?.[index + delta];
    if (!a || !b) return;
    run(async () => {
      // swap positions (use indexes so equal/legacy positions still reorder)
      await apiPatch(`/admin/application-fields/${a.id}`, { position: index + delta });
      await apiPatch(`/admin/application-fields/${b.id}`, { position: index });
    });
  }

  return (
    <div className="space-y-4">
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Label</label>
              <Input required maxLength={200} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Years of experience" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select value={fieldType} onChange={(e) => setFieldType(e.target.value as (typeof FIELD_TYPES)[number])}>
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{titleCase(t)}</option>
                ))}
              </Select>
            </div>
            {fieldType === "dropdown" && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Options (one per line)</label>
                <Textarea rows={3} required value={options} onChange={(e) => setOptions(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Help text (optional)</label>
              <Input maxLength={500} value={helpText} onChange={(e) => setHelpText(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              Required
            </label>
            <div className="sm:text-right">
              <Button type="submit">Add field</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        {fields && fields.length === 0 ? (
          <CardContent className="p-8 text-center text-sm text-slate-500">
            No custom fields. The application form only asks for the standard details.
          </CardContent>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {fields?.map((f, i) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">
                    {f.label} {f.required && <span className="text-red-600">*</span>}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {titleCase(f.field_type)}
                    {f.field_type === "dropdown" && ` · ${f.options.join(", ")}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</Button>
                  <Button size="sm" variant="ghost" disabled={i === (fields?.length ?? 0) - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(() => apiPatch(`/admin/application-fields/${f.id}`, { required: !f.required }))}
                  >
                    {f.required ? "Make optional" : "Make required"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const next = window.prompt("Field label", f.label);
                      if (next && next.trim()) run(() => apiPatch(`/admin/application-fields/${f.id}`, { label: next.trim() }));
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(`Delete "${f.label}"? Existing answers are kept.`)) {
                        run(() => apiDelete(`/admin/application-fields/${f.id}`));
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
                    <AnswersList answers={a.answers} />
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
  const [tab, setTab] = useState<"researchers" | "applications" | "form">("researchers");
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
          {(["researchers", "applications", "form"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${
                tab === t ? "border-indigo-600 text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500"
              }`}
            >
              {t === "form" ? "Application form" : t}
            </button>
          ))}
        </div>
        {notice && <SuccessAlert>{notice}</SuccessAlert>}
        {tab === "researchers" ? (
          <ResearchersPanel programs={programs} onNotice={setNotice} />
        ) : tab === "applications" ? (
          <ApplicationsPanel programs={programs} onNotice={setNotice} />
        ) : (
          <FormFieldsPanel />
        )}
      </main>
    </AppShell>
  );
}
