"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FilePlus2,
  FileText,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import {
  compressPdf,
  PRESETS,
  type CompressPreset,
  type CompressResult,
} from "@/lib/compress";
import { downloadBlob } from "@/lib/pdf";
// Single source of truth for the app version — bump with `npm version`.
import { version } from "@/package.json";

/** Files larger than this are rejected on upload (matches the organizer). */
const MAX_FILE_MB = 180;

/** crypto.randomUUID only exists on HTTPS/localhost; fall back so the
 *  app also works when opened over plain HTTP (e.g. phone via LAN IP). */
function newJobId(): string {
  return (
    crypto.randomUUID?.() ??
    `c-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

type JobStatus = "queued" | "working" | "done" | "error";

type Job = {
  id: string;
  file: File;
  status: JobStatus;
  progress: { done: number; total: number };
  result?: CompressResult;
  error?: string;
};

function formatBytes(n: number) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Top-level client component for /pdf-compress. Same shell as the
 *  organizer (sidebar + main, 12/12 stack on mobile) so the two tools
 *  feel like one app. */
export default function PdfCompressor() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [preset, setPreset] = useState<CompressPreset>("balanced");
  const [error, setError] = useState<string | null>(null);

  // Files compress strictly one at a time — two pdf.js documents plus
  // two rebuilt PDFs in memory at once is exactly the kind of pressure
  // that used to crash tabs. The queue lives in refs so the running
  // loop never depends on stale state.
  const queueRef = useRef<{ jobId: string; file: File; preset: CompressPreset }[]>([]);
  const runningRef = useRef(false);

  const patchJob = useCallback((jobId: string, patch: Partial<Job>) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j))
    );
  }, []);

  const runQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      patchJob(next.jobId, { status: "working" });
      try {
        const result = await compressPdf(next.file, next.preset, (done, total) =>
          patchJob(next.jobId, { progress: { done, total } })
        );
        patchJob(next.jobId, { status: "done", result });
      } catch (err) {
        console.error("compressPdf failed", err);
        const msg = err instanceof Error ? err.message : String(err);
        patchJob(next.jobId, { status: "error", error: msg });
      }
    }
    runningRef.current = false;
  }, [patchJob]);

  /* ---------------- files ---------------- */

  const addFiles = useCallback(
    (list: FileList) => {
      setError(null);
      for (const file of Array.from(list)) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          setError(
            `"${file.name}" is ${Math.round(file.size / 1024 / 1024)}MB — ` +
              `the limit is ${MAX_FILE_MB}MB.`
          );
          continue;
        }
        const id = newJobId();
        setJobs((prev) => [
          ...prev,
          { id, file, status: "queued", progress: { done: 0, total: 0 } },
        ]);
        // The preset is captured per file, so changing it mid-run only
        // affects files added afterwards.
        queueRef.current.push({ jobId: id, file, preset });
      }
      void runQueue();
    },
    [preset, runQueue]
  );

  const removeJob = useCallback((jobId: string) => {
    // Drop it from the pending queue too, in case it hasn't started yet.
    queueRef.current = queueRef.current.filter((q) => q.jobId !== jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const downloadJob = useCallback((job: Job) => {
    if (!job.result) return;
    const base = job.file.name.replace(/\.pdf$/i, "");
    downloadBlob(job.result.blob, `${base}-compressed.pdf`);
  }, []);

  // Warn before refresh/close while results exist — compressed files
  // live only in memory and would be lost.
  useEffect(() => {
    if (jobs.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers need returnValue set for the prompt to show.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [jobs.length]);

  const working = jobs.some((j) => j.status === "working");

  /* ---------------- layout ---------------- */

  return (
    // Mobile: sidebar stacks on top (12/12); md+: 2/10 columns — the
    // same shell as the organizer.
    <div className="flex h-dvh flex-col md:grid md:grid-cols-12">
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

        {/* Quality presets — horizontal chips on mobile, stacked on md+ */}
        <div className="p-3 md:flex-1">
          <p className="px-1 pb-2 text-xs font-medium text-muted">Quality</p>
          <div className="flex gap-2 md:flex-col">
            {(Object.keys(PRESETS) as CompressPreset[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={`flex-1 rounded-md border px-3 py-2 text-left transition-colors md:flex-none ${
                  preset === key
                    ? "border-accent/40 bg-accent-soft/60"
                    : "border-border hover:bg-accent-soft/30"
                }`}
              >
                <span
                  className={`block text-xs font-medium ${
                    preset === key ? "text-accent" : "text-foreground"
                  }`}
                >
                  {PRESETS[key].label}
                </span>
                <span className="hidden text-[10px] text-muted md:block">
                  {PRESETS[key].hint}
                </span>
              </button>
            ))}
          </div>

          <p className="hidden px-1 pt-4 text-[11px] leading-relaxed text-muted md:block">
            Best for scanned documents — pages are re-drawn as images, so
            text is no longer selectable. If a file can&apos;t be made
            smaller, your original is kept unchanged.
          </p>

          {error && <p className="px-1 pt-3 text-xs text-danger">{error}</p>}
        </div>

        {/* Actions */}
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
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = ""; // allow re-adding the same file
              }}
            />
            <Plus className="h-3.5 w-3.5" /> Add File
          </label>
        </div>
      </aside>

      <main
        className="min-h-0 flex-1 overflow-y-auto md:col-span-10 md:h-dvh"
        // Allow dropping PDF files anywhere on the work area.
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
      >
        {/* Status bar, matching the organizer's: back to home + file count */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur md:px-6 md:py-3">
          <div className="flex shrink-0 items-center gap-2">
            {/* Client-side navigation skips the beforeunload prompt, so the
                unsaved-work warning has to happen here. */}
            <Link
              href="/"
              aria-label="Back to homepage"
              onClick={(e) => {
                if (
                  jobs.length > 0 &&
                  !window.confirm(
                    "Leave the compressor? Compressed files that haven't been downloaded will be lost."
                  )
                ) {
                  e.preventDefault();
                }
              }}
              className="-ml-1 rounded-md p-1 text-muted transition-colors hover:bg-accent-soft/60 hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <p className="text-xs text-muted">
              {jobs.length} file{jobs.length === 1 ? "" : "s"}
            </p>
          </div>
          {working && (
            <p className="rounded-full bg-accent-soft px-3 py-1 text-xs text-accent">
              Compressing — keep this tab open
            </p>
          )}
        </div>

        <div className="p-3 md:p-6">
          {jobs.length === 0 ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border text-muted">
              <FilePlus2 className="h-10 w-10 shrink-0 text-accent/40" />
              <p className="text-sm">
                Drop PDF files here, or use{" "}
                <span className="text-accent">Add File</span>
              </p>
            </div>
          ) : (
            <ul className="mx-auto max-w-2xl space-y-3">
              {jobs.map((job) => {
                const saved =
                  job.result && job.result.originalSize > 0
                    ? Math.round(
                        (1 - job.result.blob.size / job.result.originalSize) * 100
                      )
                    : 0;
                return (
                  <li
                    key={job.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start gap-3">
                      <FileText
                        className="mt-0.5 shrink-0 text-accent/60"
                        size={20}
                        strokeWidth={1.5}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-medium"
                          title={job.file.name}
                        >
                          {job.file.name}
                        </p>
                        <p className="text-xs text-muted">
                          {formatBytes(job.file.size)}
                        </p>
                      </div>
                      {/* No cancel mid-compression — removing a working job
                          would leave the engine running detached. */}
                      {job.status !== "working" && (
                        <button
                          type="button"
                          aria-label={`Remove ${job.file.name}`}
                          onClick={() => removeJob(job.id)}
                          className="shrink-0 rounded p-0.5 text-muted hover:bg-danger/10 hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {job.status === "queued" && (
                      <p className="mt-3 text-xs text-muted">Waiting…</p>
                    )}

                    {job.status === "working" && (
                      <div className="mt-3 space-y-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-300"
                            style={{
                              width: job.progress.total
                                ? `${(job.progress.done / job.progress.total) * 100}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {job.progress.total
                            ? `Compressing page ${job.progress.done} of ${job.progress.total}`
                            : "Opening file…"}
                        </p>
                      </div>
                    )}

                    {job.status === "done" && job.result && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        {job.result.method === "original" ? (
                          <p className="text-xs text-muted">
                            Already optimal — this file couldn&apos;t be made
                            smaller, so the original was kept.
                          </p>
                        ) : (
                          <p className="text-xs text-muted">
                            {formatBytes(job.result.originalSize)} →{" "}
                            <span className="font-medium text-foreground">
                              {formatBytes(job.result.blob.size)}
                            </span>{" "}
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
                              −{saved}%
                            </span>
                            {job.result.method === "restructured" && (
                              <span className="ml-1.5 text-muted">
                                structure only — text kept selectable
                              </span>
                            )}
                          </p>
                        )}
                        {job.result.method !== "original" && (
                          <button
                            type="button"
                            onClick={() => downloadJob(job)}
                            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </button>
                        )}
                      </div>
                    )}

                    {job.status === "error" && (
                      <p className="mt-3 text-xs text-danger">
                        Could not compress this file: {job.error}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
