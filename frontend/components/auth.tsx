"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { Me } from "@/lib/types";

/**
 * useMe(): fetches GET /api/me once per session (module-level cache) and
 * returns { me, loading }. `me` is null when not logged in.
 *
 * With a `guard` argument the hook also redirects:
 *  - not logged in          → /login (staff pages) or /researcher/login (researcher pages)
 *  - logged in as wrong kind → bounced to their own home page
 */

let cache: Me | null | undefined = undefined;
let inflight: Promise<Me | null> | null = null;

async function loadMe(): Promise<Me | null> {
  if (cache !== undefined) return cache;
  if (!inflight) {
    inflight = apiFetch<Me>("/me")
      .then((me) => {
        cache = me;
        return me;
      })
      .catch(() => {
        // 401 or network failure → treat as logged out
        cache = null;
        return null;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Clear the cached /me (after login/logout/invite-acceptance). */
export function resetMe(): void {
  cache = undefined;
}

export function useMe(guard?: "staff" | "researcher") {
  const router = useRouter();
  const [me, setMeState] = useState<Me | null | undefined>(() => cache);
  const [loading, setLoading] = useState(cache === undefined);

  useEffect(() => {
    let cancelled = false;
    loadMe().then((m) => {
      if (!cancelled) {
        setMeState(m);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!guard || loading) return;
    if (!me) {
      router.replace(guard === "staff" ? "/login" : "/researcher/login");
    } else if (me.kind !== guard) {
      router.replace(me.kind === "staff" ? "/dashboard" : "/researcher");
    }
  }, [guard, loading, me, router]);

  return { me: me ?? null, loading };
}
