"use client";

import { useEffect, useState } from "react";
import { apiGet, errMessage } from "@/lib/api";
import type { LeaderboardEntry, ResearcherStats } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, InfoAlert } from "@/components/alerts";
import { LeaderboardTable } from "@/components/leaderboard";
import { Card, CardContent } from "@/components/ui/card";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
        <div className="mt-1 text-2xl font-semibold capitalize">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function ResearcherLeaderboardPage() {
  const { me, loading } = useMe("researcher");
  const [stats, setStats] = useState<ResearcherStats | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!me) return;
    apiGet<ResearcherStats>("/me/stats").then(setStats).catch((e) => setError(errMessage(e)));
    apiGet<LeaderboardEntry[]>("/leaderboard").then(setEntries).catch((e) => setError(errMessage(e)));
  }, [me]);

  if (loading || !me) return <FullPageLoader />;

  return (
    <AppShell me={me}>
      <main className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Points for accepted and resolved reports: info 1, low 2, medium 4, high 8, critical 16.
          </p>
        </div>
        {error && <ErrorAlert>{error}</ErrorAlert>}
        {stats && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Stat label="Submitted" value={stats.submitted} />
              <Stat label="Accepted" value={stats.accepted} />
              <Stat label="Points" value={stats.points} />
              <Stat label="Avg severity" value={stats.avg_severity ?? "—"} />
              <Stat label="Rank" value={stats.rank ? `#${stats.rank}` : "—"} />
            </div>
            {!stats.leaderboard_opt_in && (
              <InfoAlert>You are hidden from rankings. Re-enable it on your profile page.</InfoAlert>
            )}
          </>
        )}
        <Card>{entries ? <LeaderboardTable entries={entries} /> : <CardContent className="p-8 text-sm">Loading…</CardContent>}</Card>
      </main>
    </AppShell>
  );
}
