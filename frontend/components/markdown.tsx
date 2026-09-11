"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/** Renders markdown with hand-rolled prose styles (no typography plugin). */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-slate-700", className)}>
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-lg font-semibold text-slate-900" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-base font-semibold text-slate-900" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-sm font-semibold text-slate-900" {...props} />
          ),
          p: ({ node, ...props }) => <p className="whitespace-pre-wrap" {...props} />,
          a: ({ node, ...props }) => (
            <a
              className="font-medium text-indigo-600 hover:underline"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          ul: ({ node, ...props }) => <ul className="list-disc space-y-1 pl-5" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-slate-200 pl-3 text-slate-500" {...props} />
          ),
          code: ({ node, className: cls, ...props }) => (
            <code
              className={cn(
                "rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] text-slate-800",
                cls
              )}
              {...props}
            />
          ),
          pre: ({ node, ...props }) => (
            <pre
              className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
              {...props}
            />
          ),
          hr: ({ node, ...props }) => <hr className="border-slate-200" {...props} />,
          table: ({ node, ...props }) => (
            <table className="w-full border-collapse text-xs" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-slate-200 px-2 py-1" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
