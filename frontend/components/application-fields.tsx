"use client";

import type { ApplicationAnswer, ApplicationField } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type AnswerMap = Record<string, string | boolean>;

/** Stored answers ([{field_id, value}]) -> the {field_id: value} map the inputs edit. */
export function answersToMap(answers: ApplicationAnswer[] | undefined | null): AnswerMap {
  const map: AnswerMap = {};
  for (const a of answers ?? []) {
    if (a.value !== null && a.value !== undefined) {
      map[a.field_id] = typeof a.value === "boolean" ? a.value : String(a.value);
    }
  }
  return map;
}

/** Renders the super-admin-defined fields (shared by the application form and researcher profile). */
export function FieldInputs({
  fields,
  answers,
  onChange,
  requireFields = true,
}: {
  fields: ApplicationField[];
  answers: AnswerMap;
  onChange: (next: AnswerMap) => void;
  /** false on the profile page, where unanswered required fields must not block saving */
  requireFields?: boolean;
}) {
  return (
    <>
      {fields.map((f) => {
        const id = `field-${f.id}`;
        const value = answers[f.id];
        const set = (v: string | boolean) => onChange({ ...answers, [f.id]: v });
        const required = requireFields && f.required;
        const label = `${f.label}${f.required ? " *" : ""}`;
        return (
          <div key={f.id} className="space-y-1.5">
            {f.field_type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={value === true} required={required} onChange={(e) => set(e.target.checked)} />
                {label}
              </label>
            ) : (
              <Label htmlFor={id}>{label}</Label>
            )}
            {f.field_type === "textarea" && (
              <Textarea id={id} rows={3} required={required} value={String(value ?? "")} onChange={(e) => set(e.target.value)} />
            )}
            {f.field_type === "dropdown" && (
              <Select id={id} required={required} value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
                <option value="">Select…</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </Select>
            )}
            {(f.field_type === "text" || f.field_type === "url" || f.field_type === "number") && (
              <Input
                id={id}
                type={f.field_type === "text" ? "text" : f.field_type}
                required={required}
                value={String(value ?? "")}
                onChange={(e) => set(e.target.value)}
              />
            )}
            {f.help_text && <p className="text-xs text-slate-500 dark:text-slate-400">{f.help_text}</p>}
          </div>
        );
      })}
    </>
  );
}
