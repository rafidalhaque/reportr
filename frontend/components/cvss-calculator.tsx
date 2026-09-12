"use client";

import { useMemo, useState } from "react";
import { Calculator, RotateCcw, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * CVSS v3.1 base-metric calculator (todo #6): pick the eight metrics, get the
 * vector string + base score, optionally push the suggested severity into the form.
 */

type Vector = Record<string, string>;

const METRIC_DEFS: {
  key: string;
  label: string;
  options: [string, string][];
}[] = [
  { key: "AV", label: "Attack Vector", options: [["N", "Network"], ["A", "Adjacent"], ["L", "Local"], ["P", "Physical"]] },
  { key: "AC", label: "Attack Complexity", options: [["L", "Low"], ["H", "High"]] },
  { key: "PR", label: "Privileges Required", options: [["N", "None"], ["L", "Low"], ["H", "High"]] },
  { key: "UI", label: "User Interaction", options: [["N", "None"], ["R", "Required"]] },
  { key: "S", label: "Scope", options: [["U", "Unchanged"], ["C", "Changed"]] },
  { key: "C", label: "Confidentiality", options: [["H", "High"], ["L", "Low"], ["N", "None"]] },
  { key: "I", label: "Integrity", options: [["H", "High"], ["L", "Low"], ["N", "None"]] },
  { key: "A", label: "Availability", options: [["H", "High"], ["L", "Low"], ["N", "None"]] },
];

const WEIGHT_AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const WEIGHT_AC: Record<string, number> = { L: 0.77, H: 0.44 };
const WEIGHT_PR_UNCHANGED: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
const WEIGHT_PR_CHANGED: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 };
const WEIGHT_UI: Record<string, number> = { N: 0.85, R: 0.62 };
const WEIGHT_CIA: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

/** Canonical CVSS v3.1 roundup (round to one decimal, IEEE-754 safe). */
function roundUp(x: number): number {
  const intInput = Math.round(x * 100000);
  return intInput % 10000 === 0 ? intInput / 100000 : (Math.floor(intInput / 10000) + 1) / 10;
}

function computeScore(v: Vector): number | null {
  if (!v.AV || !v.AC || !v.PR || !v.UI || !v.S || !v.C || !v.I || !v.A) return null;
  const scopeChanged = v.S === "C";
  const iss = 1 - (1 - WEIGHT_CIA[v.C]) * (1 - WEIGHT_CIA[v.I]) * (1 - WEIGHT_CIA[v.A]);
  const impact = scopeChanged
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;
  if (impact <= 0) return 0;
  const exploitability = 8.22 * WEIGHT_AV[v.AV] * WEIGHT_AC[v.AC] * WEIGHT_UI[v.UI] *
    (scopeChanged ? WEIGHT_PR_CHANGED[v.PR] : WEIGHT_PR_UNCHANGED[v.PR]);
  // Scope-changed scores carry a 1.08 multiplier (CVSS v3.1 spec §8.4)
  const base = scopeChanged
    ? Math.min(1.08 * (impact + exploitability), 10)
    : Math.min(impact + exploitability, 10);
  return roundUp(base);
}

function severityOf(score: number): "info" | "low" | "medium" | "high" | "critical" | null {
  if (score <= 0) return "info";
  if (score < 4) return "low";
  if (score < 7) return "medium";
  if (score < 9) return "high";
  return "critical";
}

function toVector(v: Vector): string | null {
  if (!v.AV || !v.AC || !v.PR || !v.UI || !v.S || !v.C || !v.I || !v.A) return null;
  return `CVSS:3.1/AV:${v.AV}/AC:${v.AC}/PR:${v.PR}/UI:${v.UI}/S:${v.S}/C:${v.C}/I:${v.I}/A:${v.A}`;
}

function parseVector(value: string): Vector | null {
  const match = /^CVSS:3\.1\/AV:(N|A|L|P)\/AC:(L|H)\/PR:(N|L|H)\/UI:(N|R)\/S:(U|C)\/C:(H|L|N)\/I:(H|L|N)\/A:(H|L|N)$/.exec(
    value.trim()
  );
  if (!match) return null;
  const [, AV, AC, PR, UI, S, C, I, A] = match;
  return { AV, AC, PR, UI, S, C, I, A };
}

const SEVERITY_COLOR = {
  info: "slate",
  low: "blue",
  medium: "amber",
  high: "orange",
  critical: "red",
} as const;

export function CvssCalculator({
  value,
  onChange,
  onApplySeverity,
}: {
  value: string;
  onChange: (vector: string) => void;
  onApplySeverity: (severity: "low" | "medium" | "high" | "critical" | "info") => void;
}) {
  const [metrics, setMetrics] = useState<Vector>(() => parseVector(value) ?? {});

  const score = useMemo(() => computeScore(metrics), [metrics]);
  const vector = useMemo(() => toVector(metrics), [metrics]);
  const complete = score !== null;

  function pick(key: string, option: string) {
    setMetrics((prev) => {
      const next = { ...prev, [key]: option };
      const nextVector = toVector(next);
      if (nextVector) onChange(nextVector);
      return next;
    });
  }

  function reset() {
    setMetrics({});
  }

  return (
    <details className="rounded-lg border border-slate-200 dark:border-slate-800">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        <Calculator className="h-4 w-4" />
        CVSS v3.1 calculator
        {complete && score !== null && (
          <Badge color={SEVERITY_COLOR[severityOf(score) ?? "info"]}>base {score.toFixed(1)}</Badge>
        )}
      </summary>
      <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {METRIC_DEFS.map((def) => (
            <div key={def.key}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {def.label}
              </p>
              <div className="flex flex-wrap gap-1">
                {def.options.map(([abbr, label]) => {
                  const active = metrics[def.key] === abbr;
                  return (
                    <button
                      key={abbr}
                      type="button"
                      onClick={() => pick(def.key, abbr)}
                      title={label}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-200 dark:border-slate-800 bg-white text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      {abbr}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="text-sm">
            <span className="text-slate-500 dark:text-slate-400">Base score: </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {score !== null ? score.toFixed(1) : "—"}
            </span>
            {score !== null && severityOf(score) && (
              <Badge color={SEVERITY_COLOR[severityOf(score)!]} className="ml-2 capitalize">
                {severityOf(score)}
              </Badge>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!complete || !severityOf(score!) || score === 0}
              onClick={() => {
                if (score !== null) {
                  const severity = severityOf(score);
                  if (severity) onApplySeverity(severity);
                }
              }}
              title={score === 0 ? "A zero score suggests 'info' — set severity manually" : "Set the severity field from the score"}
            >
              <Wand2 className="h-3.5 w-3.5" />
              Use suggested severity
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}
