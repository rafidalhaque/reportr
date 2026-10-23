"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Save } from "lucide-react";
import { apiGet, apiPatch, apiPost, apiPut, errMessage } from "@/lib/api";
import type {
  EmailConfigSettings,
  EmailTemplateEntry,
  EmailTemplatePreview,
  Me,
  PlatformSettings,
} from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/alerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Platform-wide settings — super admin only: applications toggle, SMTP (#2), templates (#8). */
export default function PlatformSettingsPage() {
  const { me, loading: meLoading } = useMe("staff");

  if (meLoading) return <FullPageLoader />;
  if (!me) return <FullPageLoader label="Redirecting…" />;

  const isSuperAdmin = me.global_role === "super_admin";

  return (
    <AppShell me={me}>
      <main>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Platform settings</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Organization-wide switches, applied immediately.
            </p>
          </div>

          {!isSuperAdmin ? (
            <InfoAlert>Only super admins can view or change platform settings.</InfoAlert>
          ) : (
            <>
              <ApplicationsPanel />
              <PlatformEmailPanel />
              <EmailTemplatesPanel />
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function ApplicationsPanel() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiGet<PlatformSettings>("/settings")
      .then(setSettings)
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  async function toggleApplications(next: boolean) {
    if (!settings) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      setSettings(await apiPatch<PlatformSettings>("/settings", { researcher_applications_enabled: next }));
      setSaved(true);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <FullPageLoader label="Loading settings…" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Researcher applications</CardTitle>
        <CardDescription>
          Controls the public &ldquo;Apply to join&rdquo; form at /apply. When disabled, visitors
          see a closed notice and the API rejects new applications. Existing researchers,
          invites, and report flows are unaffected.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="applications-toggle">Public application form</Label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
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
  );
}

/* ------------------------- Platform email (SMTP, #2) ---------------------- */

function PlatformEmailPanel() {
  const [config, setConfig] = useState<EmailConfigSettings | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    apiGet<EmailConfigSettings>("/settings/email")
      .then(setConfig)
      .catch((err) => setError(errMessage(err)));
  }, []);

  useEffect(load, [load]);

  function set<K extends keyof EmailConfigSettings>(key: K, value: EmailConfigSettings[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      setConfig(
        await apiPatch<EmailConfigSettings>("/settings/email", {
          enabled: config.enabled,
          smtp_host: config.smtp_host || null,
          smtp_port: config.smtp_port || null,
          smtp_username: config.smtp_username || null,
          smtp_password: password || null, // omitted/empty keeps the stored password
          smtp_use_tls: config.smtp_use_tls,
          from_email: config.from_email || null,
          from_name: config.from_name || null,
          notify_email: config.notify_email || null,
        })
      );
      setPassword("");
      setSaved(true);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email notifications (SMTP)
        </CardTitle>
        <CardDescription>
          Platform-wide SMTP used to deliver notification emails for every program — unless a
          program overrides it in its own settings. Emails go to the triage inbox below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorAlert>{error}</ErrorAlert>}
        {saved && <SuccessAlert>Email settings saved.</SuccessAlert>}
        {!config ? (
          <FullPageLoader label="Loading…" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="email-enabled">Enable email notifications</Label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {config.enabled ? "Enabled — events are emailed." : "Disabled — email delivery off."}
                </p>
              </div>
              <Switch
                id="email-enabled"
                checked={config.enabled}
                onCheckedChange={(v) => set("enabled", v)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-host">SMTP host</Label>
                <Input
                  id="smtp-host"
                  value={config.smtp_host ?? ""}
                  onChange={(e) => set("smtp_host", e.target.value)}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">SMTP port</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={config.smtp_port ?? ""}
                  onChange={(e) => set("smtp_port", e.target.value ? Number(e.target.value) : null)}
                  placeholder="587"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user">SMTP username</Label>
                <Input
                  id="smtp-user"
                  value={config.smtp_username ?? ""}
                  onChange={(e) => set("smtp_username", e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-pass">SMTP password</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={config.smtp_password_set ? "•••• saved — leave blank to keep" : "Not set"}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="from-email">From email</Label>
                <Input
                  id="from-email"
                  type="email"
                  value={config.from_email ?? ""}
                  onChange={(e) => set("from_email", e.target.value)}
                  placeholder="bounty@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="from-name">From name</Label>
                <Input
                  id="from-name"
                  value={config.from_name ?? ""}
                  onChange={(e) => set("from_name", e.target.value)}
                  placeholder="Reportr"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notify-email">Triage inbox (notification recipient)</Label>
                <Input
                  id="notify-email"
                  type="email"
                  value={config.notify_email ?? ""}
                  onChange={(e) => set("notify_email", e.target.value)}
                  placeholder="triage@example.com"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={config.smtp_use_tls}
                  onChange={(e) => set("smtp_use_tls", e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Use TLS (STARTTLS; port 465 uses implicit TLS)
              </label>
            </div>

            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save email settings
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------- Email templates (#8) ------------------------- */

function EmailTemplatesPanel() {
  const [templates, setTemplates] = useState<EmailTemplateEntry[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<EmailTemplatePreview | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState("");

  const load = useCallback(() => {
    apiGet<EmailTemplateEntry[]>("/settings/email-templates")
      .then((list) => {
        setTemplates(list);
        setSelected((prev) => prev || list[0]?.name || "");
      })
      .catch((err) => setError(errMessage(err)));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const current = templates?.find((t) => t.name === selected);
    if (current) {
      setSubject(current.subject);
      setBody(current.body);
      setPreview(null);
      setSaved(false);
    }
  }, [selected, templates]);

  const current = templates?.find((t) => t.name === selected);

  async function save() {
    if (!current) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await apiPut<EmailTemplateEntry>(`/settings/email-templates/${current.name}`, {
        subject,
        body,
      });
      setTemplates((prev) => (prev ?? []).map((t) => (t.name === updated.name ? updated : t)));
      setSaved(true);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function doPreview() {
    if (!current) return;
    setError("");
    try {
      setPreview(await apiPost<EmailTemplatePreview>(`/settings/email-templates/${current.name}/preview`));
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function resetTemplate() {
    if (!current) return;
    setError("");
    try {
      const reset = await apiPost<EmailTemplateEntry>(`/settings/email-templates/${current.name}/reset`);
      setTemplates((prev) => (prev ?? []).map((t) => (t.name === reset.name ? reset : t)));
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function testSend() {
    if (!current) return;
    setTestError("");
    setTestResult("");
    try {
      const res = await apiPost<{ sent_to: string }>(
        `/settings/email-templates/${current.name}/test-send`,
        testRecipient ? { recipient: testRecipient } : undefined
      );
      setTestResult(`Test email sent to ${res.sent_to}.`);
    } catch (err) {
      setTestError(errMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email templates
        </CardTitle>
        <CardDescription>
          Placeholders depend on the event: <code>{"{{program}}"}</code>,{" "}
          <code>{"{{reference}}"}</code>, <code>{"{{title}}"}</code>, <code>{"{{severity}}"}</code>,{" "}
          <code>{"{{reporter}}"}</code>, <code>{"{{cwe}}"}</code>, <code>{"{{description}}"}</code>,{" "}
          <code>{"{{old_status}}"}</code>, <code>{"{{new_status}}"}</code>,{" "}
          <code>{"{{author}}"}</code>, <code>{"{{author_kind}}"}</code>, <code>{"{{internal}}"}</code>,{" "}
          <code>{"{{comment}}"}</code>, <code>{"{{email}}"}</code>, <code>{"{{for_program}}"}</code>,{" "}
          <code>{"{{expires}}"}</code>,{" "}
          <code>{"{{link}}"}</code>.
          Use the preview to see which apply. Templates apply to notification emails and
          Telegram texts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorAlert>{error}</ErrorAlert>}
        {!templates ? (
          <FullPageLoader label="Loading templates…" />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-select">Event</Label>
              <select
                id="tpl-select"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {current && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-subject">Subject</Label>
                  <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-body">Body</Label>
                  <textarea
                    id="tpl-body"
                    rows={7}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="flex min-h-[120px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={save} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save template
                  </Button>
                  <Button type="button" variant="outline" onClick={doPreview}>
                    Preview
                  </Button>
                  <Button type="button" variant="outline" onClick={resetTemplate}>
                    Reset to default
                  </Button>
                </div>

                {saved && <SuccessAlert>Template saved.</SuccessAlert>}
                {preview && (
                  <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Preview</p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{preview.subject}</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{preview.body}</p>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Test send</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      placeholder="your@email (blank = triage inbox)"
                      className="max-w-xs"
                      type="email"
                    />
                    <Button type="button" variant="outline" onClick={testSend}>
                      Send test email
                    </Button>
                  </div>
                  {testResult && (
                    <div className="mt-2">
                      <SuccessAlert>{testResult}</SuccessAlert>
                    </div>
                  )}
                  {testError && (
                    <div className="mt-2">
                      <ErrorAlert>{testError}</ErrorAlert>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
