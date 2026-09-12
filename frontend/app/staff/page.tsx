"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, ShieldX } from "lucide-react";
import { apiGet, apiPatch, apiPost, errMessage } from "@/lib/api";
import { GLOBAL_ROLES } from "@/lib/constants";
import { titleCase } from "@/lib/utils";
import type { GlobalRole, StaffMember } from "@/lib/types";
import { useMe } from "@/components/auth";
import { AppShell, FullPageLoader } from "@/components/shell";
import { ErrorAlert, SuccessAlert } from "@/components/alerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function StaffPage() {
  const { me, loading } = useMe("staff");

  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Create form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [globalRole, setGlobalRole] = useState<string>("staff");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const isSuperAdmin = me?.global_role === "super_admin";

  const load = useCallback(() => {
    apiGet<StaffMember[]>("/staff")
      .then(setStaff)
      .catch((e) => setError(errMessage(e)));
  }, []);

  useEffect(() => {
    if (me && isSuperAdmin) load();
  }, [me, isSuperAdmin, load]);

  if (loading || !me) return <FullPageLoader />;

  if (!isSuperAdmin) {
    return (
      <AppShell me={me}>
        <main>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <ShieldX className="h-10 w-10 text-red-400" />
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Super admin required</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Only super admins can manage staff accounts.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Link>
            </CardContent>
          </Card>
        </main>
      </AppShell>
    );
  }

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setNotice("");
    try {
      await apiPost<StaffMember>("/staff", {
        email,
        name,
        password,
        global_role: globalRole,
      });
      setEmail("");
      setName("");
      setPassword("");
      setGlobalRole("staff");
      setNotice("Staff account created.");
      load();
    } catch (err) {
      setCreateError(errMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function onRoleChange(member: StaffMember, role: GlobalRole | string) {
    setError("");
    setNotice("");
    try {
      await apiPatch<StaffMember>(`/staff/${member.id}`, { global_role: role });
      setNotice(`Updated role for ${member.email}.`);
      load();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  async function onToggleActive(member: StaffMember) {
    setError("");
    setNotice("");
    try {
      await apiPatch<StaffMember>(`/staff/${member.id}`, { is_active: !member.is_active });
      load();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <AppShell me={me}>
      <main>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Manage staff accounts and their global roles.
        </p>

        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Create staff account</CardTitle>
              <CardDescription>Passwords must be at least 8 characters.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onCreate} className="space-y-4">
                {createError && <ErrorAlert>{createError}</ErrorAlert>}
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-email">Email *</Label>
                    <Input
                      id="staff-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="new@company.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-name">Name</Label>
                    <Input
                      id="staff-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-password">Password *</Label>
                    <Input
                      id="staff-password"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-role">Global role</Label>
                    <Select
                      id="staff-role"
                      value={globalRole}
                      onChange={(e) => setGlobalRole(e.target.value)}
                    >
                      {GLOBAL_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {titleCase(role)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create staff account
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {notice && <div className="mb-4"><SuccessAlert>{notice}</SuccessAlert></div>}
        {error && <div className="mb-4"><ErrorAlert>{error}</ErrorAlert></div>}

        {staff && staff.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No staff accounts found.
            </CardContent>
          </Card>
        )}

        {staff && staff.length > 0 && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Global role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium text-slate-800 dark:text-slate-200">{member.email}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">{member.name || "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={member.global_role}
                        onChange={(e) => onRoleChange(member, e.target.value)}
                        className="h-8 w-36 text-xs"
                        aria-label={`Role for ${member.email}`}
                      >
                        {GLOBAL_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {titleCase(role)}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          member.is_active
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-700"
                        }`}
                      >
                        {member.is_active ? "Active" : "Disabled"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => onToggleActive(member)}>
                        {member.is_active ? "Disable" : "Enable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {!staff && !error && (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading staff…
          </div>
        )}
      </main>
    </AppShell>
  );
}
