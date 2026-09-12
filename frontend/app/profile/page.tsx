"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiGet, apiPatch, errMessage } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { resetMe, useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, SuccessAlert } from "@/components/alerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Own profile (todo #13): view + edit name (and portfolio for researchers),
 * see role and program memberships. Email/password changes come with todo #14b. */
export default function ProfilePage() {
  const { me, loading } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  if (loading || !me) return <FullPageLoader />;
  return <ProfileBody me={me} />;
}

function ProfileBody({ me }: { me: NonNullable<ReturnType<typeof useMe>["me"]> }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    apiGet<Profile>("/me/profile")
      .then((p) => {
        setProfile(p);
        setName(p.name);
        setPortfolioUrl(p.portfolio_url ?? "");
      })
      .catch((e) => setLoadError(errMessage(e)));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await apiPatch<Profile>("/me", {
        name,
        portfolio_url: profile?.kind === "researcher" ? portfolioUrl : undefined,
      });
      setProfile(updated);
      setSaved(true);
      resetMe(); // header/sidebar pick up the new name on next render
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <AppShell me={me}>
        <ErrorAlert>{loadError}</ErrorAlert>
      </AppShell>
    );
  }
  if (!profile) return <FullPageLoader label="Loading profile…" />;

  const isResearcher = profile.kind === "researcher";

  return (
    <AppShell me={me}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My profile</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {profile.email} · {isResearcher ? "Researcher" : (profile.global_role ? profile.global_role.replace("_", " ") : "Staff")}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account details</CardTitle>
              <CardDescription>
                {isResearcher
                  ? "Your public identity on reports you submit."
                  : "How your name appears on triage comments."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                {saved && <SuccessAlert>Profile updated.</SuccessAlert>}
                {error && <ErrorAlert>{error}</ErrorAlert>}

                <div className="space-y-1.5">
                  <Label htmlFor="profile-name">Display name</Label>
                  <Input
                    id="profile-name"
                    maxLength={200}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name or handle"
                  />
                </div>

                {isResearcher && (
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-portfolio">Portfolio URL</Label>
                    <Input
                      id="profile-portfolio"
                      type="url"
                      maxLength={500}
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      placeholder="https://github.com/you or your blog"
                    />
                  </div>
                )}

                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Programs</CardTitle>
              <CardDescription>
                {isResearcher
                  ? "Programs you are a member of."
                  : "Programs you hold a role on."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile.memberships.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                  {isResearcher
                    ? "No memberships yet — apply to a public program or accept an invite."
                    : "No program roles assigned yet."}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {profile.memberships.map((m) => (
                    <li key={m.program_id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link
                          href={isResearcher ? `/researcher/programs/${m.program_id}` : `/programs/${m.program_id}`}
                          className="block truncate text-sm font-medium text-indigo-600 hover:underline"
                        >
                          {m.program_name}
                        </Link>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {m.role.replace("_", " ")} · since {fmtDate(m.joined_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
