import type { LeaderboardEntry } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Ranked researcher table shared by the leaderboard and hall-of-fame pages. */
export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No accepted reports yet — be the first.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Rank</TableHead>
          <TableHead>Researcher</TableHead>
          <TableHead className="text-right">Accepted</TableHead>
          <TableHead className="text-right">Points</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={`${e.rank}-${e.name}`} className={e.is_me ? "bg-indigo-50 dark:bg-indigo-950/40" : ""}>
            <TableCell className="font-semibold">#{e.rank}</TableCell>
            <TableCell>
              {e.name}
              {e.is_me && " (you)"}
            </TableCell>
            <TableCell className="text-right">{e.accepted}</TableCell>
            <TableCell className="text-right font-semibold">{e.points}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
