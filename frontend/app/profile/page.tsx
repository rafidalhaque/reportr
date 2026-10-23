"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiGet, apiPatch, apiPost, errMessage } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { resetMe, useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/alerts";
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
  const [optIn, setOptIn] = useState(true);
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
        setOptIn(p.leaderboard_opt_in ?? true);
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
        leaderboard_opt_in: profile?.kind === "researcher" ? optIn : undefined,
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">My profile</h1>
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

                {isResearcher && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
                    Show me on leaderboards and public halls of fame
                  </label>
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

        <AccountSecurityCard isResearcher={profile.kind === "researcher"} />
      </div>
    </AppShell>
  );
}

function AccountSecurityCard({ isResearcher }: { isResearcher: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");
  const [emailError, setEmailError] = useState("");

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }
    setPwSaving(true);
    setPwError("");
    setPwSaved(false);
    try {
      await apiPatch("/me/password", { current_password: currentPassword, new_password: newPassword });
      setPwSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwError(errMessage(err));
    } finally {
      setPwSaving(false);
    }
  }

  async function changeEmail(event: React.FormEvent) {
    event.preventDefault();
    setEmailSaving(true);
    setEmailError("");
    setEmailNotice("");
    try {
      await apiPost("/me/email", { new_email: newEmail, current_password: emailPassword });
      setEmailNotice(
        `A verification link was sent to ${newEmail}. Your email changes once you open it.`
      );
      setNewEmail("");
      setEmailPassword("");
    } catch (err) {
      setEmailError(errMessage(err));
    } finally {
      setEmailSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account security</CardTitle>
        <CardDescription>
          Password changes require your current password. Email changes are confirmed via a
          verification link sent to the new address.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={changePassword} className="space-y-4">
          {pwSaved && <SuccessAlert>Password updated.</SuccessAlert>}
          {pwError && <ErrorAlert>{pwError}</ErrorAlert>}
          <div className="space-y-1.5">
            <Label htmlFor="sec-current-pw">Current password</Label>
            <Input
              id="sec-current-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sec-new-pw">New password</Label>
              <Input
                id="sec-new-pw"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sec-confirm-pw">Confirm new password</Label>
              <Input
                id="sec-confirm-pw"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button type="submit" disabled={pwSaving}>
            {pwSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Change password
          </Button>
        </form>

        <form onSubmit={changeEmail} className="space-y-4 lg:border-l lg:border-slate-100 lg:pl-6 dark:lg:border-slate-800">
          {emailNotice && <InfoAlert>{emailNotice}</InfoAlert>}
          {emailError && <ErrorAlert>{emailError}</ErrorAlert>}
          <div className="space-y-1.5">
            <Label htmlFor="sec-new-email">New email</Label>
            <Input
              id="sec-new-email"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@new-address.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sec-email-pw">Current password</Label>
            <Input
              id="sec-email-pw"
              type="password"
              required
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {isResearcher && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You will sign in with the new email after confirming it.
            </p>
          )}
          <Button type="submit" variant="outline" disabled={emailSaving}>
            {emailSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Request email change
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
