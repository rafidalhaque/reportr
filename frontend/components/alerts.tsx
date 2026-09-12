import * as React from "react";
import { cn } from "@/lib/utils";

export function ErrorAlert({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
        className
      )}
      role="alert"
    >
      {children}
    </div>
  );
}

export function SuccessAlert({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
        className
      )}
      role="status"
    >
      {children}
    </div>
  );
}

export function InfoAlert({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
        className
      )}
      role="note"
    >
      {children}
    </div>
  );
}
