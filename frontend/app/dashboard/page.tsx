"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { apiGet, apiPost, errMessage } from "@/lib/api";
import { PROGRAM_STATUSES, PROGRAM_VISIBILITIES } from "@/lib/constants";
import { fmtDate } from "@/lib/utils";
import type { Program } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { ProgramStatusBadge, VisibilityBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

function NewProgramForm({ onCreated }: { onCreated: (program: Program) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [visibility, setVisibility] = useState<string>("private");
  const [scopeMarkdown, setScopeMarkdown] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const created = await apiPost<Program>("/programs", {
        name,
        description,
        status,
        visibility,
        scope_markdown: scopeMarkdown,
      });
      onCreated(created);
    } catch (err) {
      setError(errMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New program</CardTitle>
        <CardDescription>
          Programs start as drafts — flip them to active once the scope is ready.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorAlert>{error}</ErrorAlert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="program-name">Name *</Label>
              <Input
                id="program-name"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Web Asset Bounty"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="program-status">Status</Label>
                <Select id="program-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {PROGRAM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="program-visibility">Visibility</Label>
                <Select
                  id="program-visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                >
                  {PROGRAM_VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="program-description">Description</Label>
            <Textarea
              id="program-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short public summary of the program"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="program-scope">Overview (markdown)</Label>
            <Textarea
              id="program-scope"
              rows={6}
              className="font-mono text-xs"
              value={scopeMarkdown}
              onChange={(e) => setScopeMarkdown(e.target.value)}
              placeholder={"## Rules\n- No automated scanning\n- Report responsibly"}
            />
            <p className="text-xs text-slate-400">
              Program overview and rules (markdown) — shown to researchers on the program page. Add structured scope entries later on the Scope tab.
            </p>
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create program
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { me, loading } = useMe("staff");
  const router = useRouter();

  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    apiGet<Program[]>("/programs")
      .then(setPrograms)
      .catch((e) => setError(errMessage(e)));
  }, []);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  if (loading || !me) return <FullPageLoader />;

  const isOrgAdmin = me.global_role === "super_admin" || me.global_role === "org_admin";

  return (
    <AppShell me={me}>
      <main>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Programs</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isOrgAdmin
                ? "All programs in the organization."
                : "Programs you are assigned to."}
            </p>
          </div>
          {isOrgAdmin && (
            <Button onClick={() => setShowForm((v) => !v)}>
              <Plus className="h-4 w-4" />
              New program
            </Button>
          )}
        </div>

        {isOrgAdmin && showForm && (
          <div className="mb-8">
            <NewProgramForm
              onCreated={(created) => {
                setShowForm(false);
                router.push(`/programs/${created.id}`);
              }}
            />
          </div>
        )}

        {error && <ErrorAlert>{error}</ErrorAlert>}

        {!programs && !error && (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading programs…
          </div>
        )}

        {programs && programs.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {isOrgAdmin
                ? "No programs yet. Create the first one with the “New program” button."
                : "You have not been assigned to any programs yet. An org admin can assign you a program role."}
            </CardContent>
          </Card>
        )}

        {programs && programs.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => (
              <Link key={program.id} href={`/programs/${program.id}`} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="group-hover:text-indigo-700">{program.name}</CardTitle>
                      <ProgramStatusBadge status={program.status} />
                    </div>
                    <CardDescription className="flex items-center gap-2">
                      <VisibilityBadge visibility={program.visibility} />
                      <span>Created {fmtDate(program.created_at)}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                      {program.description || "No description provided."}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
