"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { errMessage, uploadFile } from "@/lib/api";
import type { UploadOut } from "@/lib/types";
import { ALLOWED_UPLOAD_EXTENSIONS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/alerts";

/**
 * Uploads picked files via POST /api/uploads and keeps the returned
 * {key, name} pairs client-side; they are sent with the report create/patch.
 */
export function AttachmentsPicker({
  value,
  onChange,
  disabled,
}: {
  value: UploadOut[];
  onChange: (next: UploadOut[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handlePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      const uploaded: UploadOut[] = [];
      for (const file of files) {
        uploaded.push(await uploadFile(file));
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_UPLOAD_EXTENSIONS}
        className="hidden"
        onChange={handlePicked}
        disabled={disabled || uploading}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : "Attach files"}
      </Button>
      {error && <ErrorAlert>{error}</ErrorAlert>}
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((attachment, index) => (
            <li
              key={`${attachment.key}-${index}`}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
            >
              <span className="truncate">
                <Paperclip className="mr-1.5 inline h-3 w-3 text-slate-400" />
                {attachment.name}
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:text-slate-300"
                aria-label={`Remove ${attachment.name}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-400">
        Max 5 MB per file. Allowed: png, jpg, jpeg, gif, webp, pdf, txt, md, log, json, zip.
      </p>
    </div>
  );
}
