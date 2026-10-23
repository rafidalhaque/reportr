"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  Loader2,
  Trophy,
  LogOut,
  Menu,
  Settings,
  Shield,
  UserCircle,
  Users,
} from "lucide-react";
import { apiGet, logout } from "@/lib/api";
import { titleCase } from "@/lib/utils";
import type { Me } from "@/lib/types";
import { resetMe } from "@/components/auth";
import { ThemeToggle } from "@/components/theme";
import { Button, buttonVariants } from "@/components/ui/button";

export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
      <Shield className="h-5 w-5 text-indigo-600" />
      Reportr
    </Link>
  );
}

/** Header for public pages (landing, apply, invite, public report form). */
export function PublicHeader() {
  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Brand />
        <nav className="flex items-center gap-2">
          <ThemeToggle />
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

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function navFor(me: Me): NavItem[] {
  if (me.kind === "researcher") {
    return [
      { href: "/researcher", label: "My workspace", icon: LayoutDashboard },
      { href: "/researcher/notifications", label: "Notifications", icon: Bell },
      { href: "/researcher/leaderboard", label: "Leaderboard", icon: Trophy },
      { href: "/profile", label: "My profile", icon: UserCircle },
    ];
  }
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/profile", label: "My profile", icon: UserCircle },
  ];
  if (me.global_role === "super_admin") {
    items.push(
      { href: "/staff", label: "Staff", icon: Users },
      { href: "/settings", label: "Platform settings", icon: Settings }
    );
  }
  return items;
}

/**
 * Authenticated app chrome (todo #12): fixed role-aware sidebar on desktop,
 * slide-over drawer behind a top bar on mobile. Includes the theme toggle,
 * profile link (#13) and sign-out.
 */
export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isStaff = me.kind === "staff";
  const nav = navFor(me);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (isStaff) return;
    const refresh = () =>
      apiGet<{ unread: number }>("/me/notifications/unread-count")
        .then((r) => setUnread(r.unread))
        .catch(() => setUnread(0));
    refresh();
    // The notifications page fires this after marking everything read.
    window.addEventListener("inbox-updated", refresh);
    return () => window.removeEventListener("inbox-updated", refresh);
  }, [isStaff, pathname]);

  async function handleSignOut() {
    try {
      await logout(isStaff ? "staff" : "researchers");
    } catch {
      // cookie may already be gone; continue with local sign-out
    }
    resetMe();
    router.replace(isStaff ? "/login" : "/researcher/login");
  }

  function navClass(href: string): string {
    const active = pathname === href || (href !== "/dashboard" && href !== "/researcher" && pathname.startsWith(href));
    return `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    }`;
  }

  const sidebarBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-slate-200 px-4 dark:border-slate-800">
        <Brand href={isStaff ? "/dashboard" : "/researcher"} />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className={navClass(item.href)} onClick={() => setMenuOpen(false)}>
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.href === "/researcher/notifications" && unread > 0 && (
              <span className="ml-auto rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white">{unread}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="mb-2 px-1">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {me.name || me.email}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{roleLabel(me)}</div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="flex-1 justify-start">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block">
        {sidebarBody}
      </aside>

      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Brand href={isStaff ? "/dashboard" : "/researcher"} />
        <ThemeToggle />
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 dark:bg-black/60"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-60 bg-white shadow-lg dark:bg-slate-900">
            {sidebarBody}
          </aside>
        </div>
      )}

      <div className="md:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
