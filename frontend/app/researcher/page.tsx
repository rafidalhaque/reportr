"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { apiGet, errMessage } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import type { Program, Report } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { ProgramStatusBadge, ReportStatusBadge, SeverityBadge } from "@/components/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ResearcherHomePage() {
  const { me, loading } = useMe("researcher");

  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!me) return;
    apiGet<Program[]>("/programs")
      .then(setPrograms)
      .catch((e) => setError(errMessage(e)));
    apiGet<Report[]>("/reports")
      .then(setReports)
      .catch((e) => setError(errMessage(e)));
  }, [me]);

  if (loading || !me) return <FullPageLoader />;

  return (
    <AppShell me={me}>
      <main>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{me.name ? `, ${me.name}` : ""}
        </h1>
        <p className="mb-8 text-sm text-slate-500">
          Your programs and submitted reports at a glance.
        </p>

        {error && <div className="mb-6"><ErrorAlert>{error}</ErrorAlert></div>}

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">My programs</h2>
          {!programs && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading programs…
            </div>
          )}
          {programs && programs.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-slate-500">
                You are not a member of any program yet. You will get access once your
                application is approved and an invite is issued.
              </CardContent>
            </Card>
          )}
          {programs && programs.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {programs.map((program) => (
                <Link key={program.id} href={`/researcher/programs/${program.id}`} className="group">
                  <Card className="h-full transition-shadow group-hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="group-hover:text-indigo-700">{program.name}</CardTitle>
                        <ProgramStatusBadge status={program.status} />
                      </div>
                      <CardDescription>Created {fmtDate(program.created_at)}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="line-clamp-2 text-sm text-slate-600">
                        {program.description || "No description provided."}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">My reports</h2>
          {!reports && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading reports…
            </div>
          )}
          {reports && reports.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-slate-500">
                No reports submitted yet. Open a program above to submit your first report.
              </CardContent>
            </Card>
          )}
          {reports && reports.length > 0 && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <Link
                          href={`/researcher/reports/${report.id}`}
                          className="font-medium text-indigo-600 hover:underline"
                        >
                          {report.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600">{report.program_name}</TableCell>
                      <TableCell>
                        <SeverityBadge severity={report.severity} />
                      </TableCell>
                      <TableCell>
                        <ReportStatusBadge status={report.status} />
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
        </section>
      </main>
    </AppShell>
  );
}
