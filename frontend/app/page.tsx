"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bug, Loader2, ShieldCheck } from "lucide-react";
import { apiGet, errMessage } from "@/lib/api";
import type { PublicProgram } from "@/lib/types";
import { PublicHeader } from "@/components/shell";
import { ErrorAlert } from "@/components/alerts";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";

export default function LandingPage() {
  const [programs, setPrograms] = useState<PublicProgram[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<PublicProgram[]>("/public/programs")
      .then(setPrograms)
      .catch((e) => setError(errMessage(e)));
  }, []);

  return (
    <div className="min-h-screen">
      <PublicHeader />

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <section className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-900">
            <ShieldCheck className="h-3.5 w-3.5" />
            Coordinated vulnerability disclosure
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            Hunt bugs. Get recognized.
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
            Report security issues to our programs, triage with our team, and earn
            recognition for valid findings. Researchers can apply to join at any time.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/apply" className={buttonVariants({ size: "lg" })}>
              Apply to join
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/researcher/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Researcher login
            </Link>
          </div>
        </section>

        <section className="mt-14">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Public programs</h2>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {programs ? `${programs.length} active` : ""}
            </span>
          </div>

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
                No public programs are accepting submissions right now. Check back soon
                or apply to join and get notified about new programs.
              </CardContent>
            </Card>
          )}

          {programs && programs.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {programs.map((program) => (
                <Card key={program.id} className="flex h-full flex-col">
                  <CardHeader>
                    <CardTitle>{program.name}</CardTitle>
                    <CardDescription>/{program.slug}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    {program.description.trim() ? (
                      <Markdown content={program.description} className="text-sm" />
                    ) : (
                      <p className="text-sm italic text-slate-400">No description provided.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/apply?program=${program.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
                      >
                        Apply
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      {program.public_reporting && (
                        <Link
                          href={`/report/${program.slug}`}
                          className={buttonVariants({ size: "sm", className: "self-start" })}
                        >
                          <Bug className="h-3.5 w-3.5" />
                          Report a bug
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-400">
        Reportr — self-hosted, coordinated disclosure.
      </footer>
    </div>
  );
}
