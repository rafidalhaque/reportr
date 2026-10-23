"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { apiGet, errMessage } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import type { ProgramDetail, Report, ScopeEntry } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { ProgramStatusBadge, ReportStatusBadge, SeverityBadge, VisibilityBadge } from "@/components/badges";
import { Markdown } from "@/components/markdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Tab = "overview" | "scope" | "reports";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "scope", label: "Scope" },
  { key: "reports", label: "Reports" },
];

export default function ResearcherProgramPage() {
  const { me, loading } = useMe("researcher");
  const params = useParams<{ id: string }>();
  const programId = typeof params?.id === "string" ? params.id : "";

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [scopeEntries, setScopeEntries] = useState<ScopeEntry[]>([]);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!programId) return;
    apiGet<ProgramDetail>(`/programs/${programId}`)
      .then(setProgram)
      .catch((e) => setError(errMessage(e)));
    apiGet<ScopeEntry[]>(`/programs/${programId}/scope`)
      .then(setScopeEntries)
      .catch(() => setScopeEntries([]));
    apiGet<Report[]>("/reports", { program_id: programId })
      .then(setReports)
      .catch(() => setReports([]));
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

  const acceptingReports = program.status === "active";

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

        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
              <ProgramStatusBadge status={program.status} />
              <VisibilityBadge visibility={program.visibility} />
            </div>
            {acceptingReports ? (
              <Link href={`/researcher/programs/${programId}/submit`} className={buttonVariants({})}>
                <Send className="h-4 w-4" />
                Submit report
              </Link>
            ) : (
              <Button disabled title={`Not accepting reports (status: ${program.status})`}>
                <Send className="h-4 w-4" />
                Submit report
              </Button>
            )}
          </div>
          {program.description.trim() && (
            <Markdown content={program.description} className="mt-2 text-sm text-slate-600 dark:text-slate-300" />
          )}
        </div>

        <div className="mb-6 border-b border-slate-200 dark:border-slate-800">
          <nav className="-mb-px flex gap-1" aria-label="Program sections">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
                }`}
              >
                {t.label}
                {t.key === "reports" && reports && reports.length > 0 && (
                  <span className="ml-1.5 text-xs text-slate-400">{reports.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {tab === "overview" && (
          <Card>
            <CardContent className="p-6">
              {program.scope_markdown.trim() ? (
                <Markdown content={program.scope_markdown} />
              ) : (
                <p className="text-sm italic text-slate-400">No overview provided for this program.</p>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "scope" && (
          <Card>
            <CardContent className="p-6">
              {scopeEntries.length === 0 ? (
                <p className="text-sm italic text-slate-400">No scope entries defined for this program.</p>
              ) : (
                <>
              {scopeEntries.length > 0 && (
                <div className="mb-4 overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Target</th>
                        <th className="px-3 py-2 font-medium">Scope</th>
                        <th className="px-3 py-2 font-medium">Severity guide</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {scopeEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-200">
                            {entry.target}
                            {entry.description && (
                              <div className="mt-0.5 font-sans text-slate-500 dark:text-slate-400">{entry.description}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {entry.in_scope ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                In
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-medium text-slate-600 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                                Out
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{entry.severity_guide ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "reports" && (
          <Card>
            {reports && reports.length === 0 ? (
              <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                You haven't submitted any reports to this program yet.
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports?.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                      <TableCell>
                        <Link href={`/researcher/reports/${r.id}`} className="font-medium text-indigo-600 hover:underline">
                          {r.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <SeverityBadge severity={r.severity} />
                      </TableCell>
                      <TableCell>
                        <ReportStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>{fmtDate(r.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        )}
      </main>
    </AppShell>
  );
}
