import type { ApplicationAnswer } from "@/lib/types";

/** Answers to the custom application-form questions. */
export function AnswersList({ answers }: { answers?: ApplicationAnswer[] }) {
  if (!answers || answers.length === 0) return null;
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {answers.map((a) => (
        <div key={a.field_id}>
          <dt className="font-medium text-slate-500 dark:text-slate-400">{a.label}</dt>
          <dd className="text-slate-800 dark:text-slate-200">
            {typeof a.value === "boolean" ? (a.value ? "Yes" : "No") : String(a.value ?? "—")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
