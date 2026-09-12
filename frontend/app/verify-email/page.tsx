"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { apiPost, errMessage } from "@/lib/api";
import { PublicHeader, FullPageLoader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function VerifyEmailChange() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setDetail("This link is missing its verification token.");
      return;
    }
    apiPost<{ email: string }>("/me/email/verify", { token })
      .then((res) => {
        setDetail(res.email);
        setState("ok");
      })
      .catch((err) => {
        setDetail(errMessage(err));
        setState("error");
      });
  }, [token]);

  return state === "loading" ? (
    <FullPageLoader label="Verifying…" />
  ) : (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        {state === "ok" ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Email verified
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your email is now <strong>{detail}</strong>. Use it to sign in from now on.
            </p>
            <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Back to home
            </Link>
          </>
        ) : (
          <>
            <ShieldAlert className="h-10 w-10 text-slate-400" />
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Verification failed
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">{detail}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Request a new change from your profile, or ask an administrator for help.
            </p>
            <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Back to home
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Suspense fallback={<FullPageLoader />}>
          <VerifyEmailChange />
        </Suspense>
      </main>
    </div>
  );
}
