"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, errMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/utils";
import type { InboxNotification } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ResearcherNotificationsPage() {
  const { me, loading } = useMe("researcher");
  const [items, setItems] = useState<InboxNotification[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiGet<InboxNotification[]>("/me/notifications")
      .then(setItems)
      .catch((e) => setError(errMessage(e)));
  }, []);

  useEffect(() => {
    if (!me) return;
    load();
    // Opening the inbox marks everything as seen; pending invitations stay actionable.
    apiPost("/me/notifications/read-all")
      .then(() => window.dispatchEvent(new Event("inbox-updated")))
      .catch(() => {});
  }, [me, load]);

  async function respond(n: InboxNotification, action: "accept" | "decline") {
    setError("");
    try {
      await apiPost(`/me/invites/${n.invite_id}/${action}`);
      load();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  if (loading || !me) return <FullPageLoader />;

  return (
    <AppShell me={me}>
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {error && <ErrorAlert>{error}</ErrorAlert>}
        {items && items.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Nothing here yet. Program invitations will show up in this inbox.
            </CardContent>
          </Card>
        )}
        <div className="space-y-3">
          {items?.map((n) => (
            <Card key={n.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-medium">{n.title}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{n.body}</div>
                  <div className="mt-1 text-xs text-slate-400">{fmtDateTime(n.created_at)}</div>
                </div>
                {n.kind === "invite" &&
                  (n.invite_pending ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => respond(n, "accept")}>Accept</Button>
                      <Button size="sm" variant="outline" onClick={() => respond(n, "decline")}>Decline</Button>
                    </div>
                  ) : (
                    <Badge color="slate">Closed</Badge>
                  ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
