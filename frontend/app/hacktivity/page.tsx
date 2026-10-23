"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, errMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/utils";
import type { HacktivityEvent } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { SeverityBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const PAGE = 30;

function describe(e: HacktivityEvent) {
  if (e.kind === "program_launched") {
    return (
      <>
        New program <strong>{e.program_name}</strong> is now open.
      </>
    );
  }
  const verb = e.kind === "report_resolved" ? "had a report resolved" : "had a report accepted";
  return (
    <>
      <strong>{e.researcher_name}</strong> {verb} in <strong>{e.program_name}</strong>
      {e.cwe_name ? <> — {e.cwe_name}</> : null}
    </>
  );
}

/** Platform-wide activity feed (no report details), for every logged-in user. */
export default function HacktivityPage() {
  const router = useRouter();
  const { me, loading } = useMe();
  const [events, setEvents] = useState<HacktivityEvent[] | null>(null);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  const load = useCallback(async (before?: string) => {
    setBusy(true);
    try {
      const page = await apiGet<HacktivityEvent[]>("/hacktivity", { limit: PAGE, before });
      setEvents((prev) => (before ? [...(prev ?? []), ...page] : page));
      setMore(page.length === PAGE);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  if (loading || !me) return <FullPageLoader />;

  return (
    <AppShell me={me}>
      <main className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hacktivity</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Recent activity across public and internal programs. Report details stay private.
          </p>
        </div>
        {error && <ErrorAlert>{error}</ErrorAlert>}
        {events && events.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No activity yet.
            </CardContent>
          </Card>
        )}
        <div className="space-y-2">
          {events?.map((e, i) => (
            <Card key={`${e.at}-${i}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>{describe(e)}</div>
                <div className="flex items-center gap-3">
                  {e.severity && <SeverityBadge severity={e.severity} />}
                  <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDateTime(e.at)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {events && more && events.length > 0 && (
          <Button variant="outline" disabled={busy} onClick={() => load(events[events.length - 1].at)}>
            Load more
          </Button>
        )}
      </main>
    </AppShell>
  );
}
