"use client";

import { Download, FileText, Loader2, Plus, X } from "lucide-react";
import type { PdfFile } from "@/lib/types";
// Single source of truth for the app version — bump with `npm version`.
import { version } from "@/package.json";

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
  return (
    // Mobile: full-width bar above the grid; md+: fixed left column.
    <aside className="flex flex-col border-b border-border bg-card md:col-span-2 md:h-dvh md:border-r md:border-b-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/app-assets/PageDeck_Logo_NoBG.svg"
          alt="PageDeck"
          className="h-6 w-auto"
        />
        <p className="text-xs text-muted">Version {version}</p>
      </div>

      {/* File list — one horizontal touch-scroll row on mobile (scrollbar
          hidden), vertical scrolling list on md+ */}
      <div className="p-2 md:flex-1 md:overflow-y-auto">
        {files.length === 0 && !loading && (
          <p className="px-2 py-2 text-xs text-muted md:py-4">No files yet.</p>
        )}

        <ul className="scrollbar-hide flex gap-1.5 overflow-x-auto md:block md:space-y-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="group flex shrink-0 items-start gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-accent-soft/50 md:border-0"
            >
              {/* Icon tinted with the file's color — legend for the grid
                  outlines. Fixed size, spans both text lines. */}
              <FileText
                className="shrink-0 mt-0.5"
                size={20}
                strokeWidth={1.5}
                style={{ color: f.color }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-xs font-medium leading-none"
                  title={f.name}
                >
                  {/* Hard cap long names so one file can't hog the row */}
                  {f.name.length > 16 ? `${f.name.slice(0, 16)}…` : f.name}
                </p>
                <p className="text-[10px] text-muted">{f.pageCount} pages</p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onRemoveFile(f.id)}
                // Always visible on mobile (no hover on touch), hover-revealed on md+
                className="shrink-0 rounded p-0.5 text-muted transition-opacity hover:bg-danger/10 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
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

      {/* Actions — side by side on mobile to save vertical space */}
      <div className="flex gap-2 border-t border-border p-3 md:flex-col">
        {/* The invisible file input is stretched over the button face, so a
            tap lands on the input itself — fully native on iOS, no label
            forwarding or JS click involved. */}
        <label className="relative flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft/60 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent-soft">
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(e) => {
              if (e.target.files?.length) onAddFiles(e.target.files);
              e.target.value = ""; // allow re-adding the same file
            }}
          />
          <Plus className="h-3.5 w-3.5" /> Add File
        </label>
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
