"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet, errMessage } from "@/lib/api";
import type { HallOfFame } from "@/lib/types";
import { PublicHeader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { LeaderboardTable } from "@/components/leaderboard";
import { Card } from "@/components/ui/card";

export default function HallOfFamePage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [data, setData] = useState<HallOfFame | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    apiGet<HallOfFame>(`/public/programs/${slug}/hall-of-fame`)
      .then(setData)
      .catch((e) => setError(errMessage(e)));
  }, [slug]);

  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {error && <ErrorAlert>{error}</ErrorAlert>}
        {data && (
          <>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight">{data.program_name} — Hall of fame</h1>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Researchers who helped secure this program (opted in to public rankings).
            </p>
            <Card>
              <LeaderboardTable entries={data.entries} />
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
