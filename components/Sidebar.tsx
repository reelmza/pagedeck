"use client";

import { useRef } from "react";
import { Download, FileText, Loader2, Plus, X } from "lucide-react";
import type { PdfFile } from "@/lib/types";

type Props = {
  files: PdfFile[];
  loading: boolean;
  exporting: boolean;
  error: string | null;
  onAddFiles: (files: FileList) => void;
  onRemoveFile: (fileId: string) => void;
  onExport: () => void;
};

/** Left panel: uploaded file list, add / remove, and export. */
export default function Sidebar({
  files,
  loading,
  exporting,
  error,
  onAddFiles,
  onRemoveFile,
  onExport,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <aside className="col-span-2 flex h-screen flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <h1 className="text-sm font-semibold text-accent">
          Office PDF Organizer
        </h1>
        <p className="mt-0.5 text-xs text-muted">Version 1.0.0</p>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 && !loading && (
          <p className="px-2 py-4 text-xs text-muted">No files yet.</p>
        )}

        <ul className="space-y-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent-soft/50"
            >
              {/* Icon tinted with the file's color — legend for the grid outlines */}
              <FileText
                className="h-4 w-4 shrink-0"
                style={{ color: f.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={f.name}>
                  {f.name}
                </p>
                <p className="text-[10px] text-muted">{f.pageCount} pages</p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onRemoveFile(f.id)}
                className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>

        {loading && (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening file…
          </div>
        )}
        {error && <p className="px-2 py-2 text-xs text-danger">{error}</p>}
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t border-border p-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAddFiles(e.target.files);
            e.target.value = ""; // allow re-adding the same file
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft/60 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          <Plus className="h-3.5 w-3.5" /> Add File
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={files.length === 0 || exporting}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {exporting ? "Exporting…" : "Export PDF"}
        </button>
      </div>
    </aside>
  );
}
