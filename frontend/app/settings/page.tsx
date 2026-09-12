"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiGet, apiPatch, errMessage } from "@/lib/api";
import type { Me, PlatformSettings } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/alerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Platform-wide settings — super admin only. */
export default function PlatformSettingsPage() {
  const { me, loading: meLoading } = useMe("staff");

  if (meLoading) return <FullPageLoader />;
  if (!me) return <FullPageLoader label="Redirecting…" />;
  return (
    <AppShell me={me}>
      <main>
        <PlatformSettingsPanel me={me} />
      </main>
    </AppShell>
  );
}

function PlatformSettingsPanel({ me }: { me: Me }) {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const isSuperAdmin = me.global_role === "super_admin";

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    apiGet<PlatformSettings>("/settings")
      .then(setSettings)
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, [isSuperAdmin]);

  async function toggleApplications(next: boolean) {
    if (!settings) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await apiPatch<PlatformSettings>("/settings", {
        researcher_applications_enabled: next,
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <FullPageLoader label="Loading settings…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform settings</h1>
        <p className="text-sm text-slate-500">Organization-wide switches, applied immediately.</p>
      </div>

      {error && <ErrorAlert>{error}</ErrorAlert>}

      {!isSuperAdmin ? (
        <InfoAlert>Only super admins can view or change platform settings.</InfoAlert>
      ) : (
        <>
          {saved && <SuccessAlert>Settings updated.</SuccessAlert>}
          <Card>
            <CardHeader>
              <CardTitle>Researcher applications</CardTitle>
              <CardDescription>
                Controls the public &ldquo;Apply to join&rdquo; form at /apply. When disabled,
                visitors see a closed notice and the API rejects new applications. Existing
                researchers, invites, and report flows are unaffected.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="applications-toggle">Public application form</Label>
                <p className="text-xs text-slate-500">
                  {settings?.researcher_applications_enabled
                    ? "Open — anyone can apply to join."
                    : "Closed — new applications are rejected."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                <Switch
                  id="applications-toggle"
                  checked={!!settings?.researcher_applications_enabled}
                  onCheckedChange={toggleApplications}
                  disabled={saving || !settings}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
