"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Shield } from "lucide-react";
import { logout } from "@/lib/api";
import { titleCase } from "@/lib/utils";
import type { Me } from "@/lib/types";
import { resetMe } from "@/components/auth";
import { Button, buttonVariants } from "@/components/ui/button";

export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold text-slate-900">
      <Shield className="h-5 w-5 text-indigo-600" />
      Bug Bounty Platform
    </Link>
  );
}

/** Header for public pages (landing, apply, invite). */
export function PublicHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Brand />
        <nav className="flex items-center gap-2">
          <Link href="/researcher/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Researcher login
          </Link>
          <Link href="/login" className={buttonVariants({ size: "sm" })}>
            Staff login
          </Link>
        </nav>
      </div>
    </header>
  );
}

function roleLabel(me: Me): string {
  if (me.kind === "researcher") return "Researcher";
  return me.global_role ? titleCase(me.global_role) : "Staff";
}

/** Authenticated app header with nav + sign out. */
export function AppHeader({ me }: { me: Me }) {
  const router = useRouter();
  const isStaff = me.kind === "staff";

  async function handleSignOut() {
    try {
      await logout(isStaff ? "staff" : "researchers");
    } catch {
      // cookie may already be gone; continue with local sign-out
    }
    resetMe();
    router.replace(isStaff ? "/login" : "/researcher/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Brand href={isStaff ? "/dashboard" : "/researcher"} />
          <nav className="flex items-center gap-1 text-sm">
            {isStaff ? (
              <>
                <Link
                  href="/dashboard"
                  className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Dashboard
                </Link>
                {me.global_role === "super_admin" && (
                  <Link
                    href="/staff"
                    className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    Staff
                  </Link>
                )}
                {me.global_role === "super_admin" && (
                  <Link
                    href="/settings"
                    className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    Settings
                  </Link>
                )}
              </>
            ) : (
              <Link
                href="/researcher"
                className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                My workspace
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-tight text-slate-900">
              {me.name || me.email}
            </div>
            <div className="text-xs leading-tight text-slate-500">{roleLabel(me)}</div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
