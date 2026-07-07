import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfFile, PageRef } from "./types";

/* ------------------------------------------------------------------ */
/* pdf.js setup — loaded lazily so the heavy library is only fetched  */
/* in the browser, never during server rendering.                     */
/* ------------------------------------------------------------------ */

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // Rendering runs in a web worker so big files don't freeze the UI.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Open pdf.js documents, keyed by file id. Kept outside React state —
 *  these are big native objects that should never be cloned or diffed. */
const docs = new Map<string, PDFDocumentProxy>();

/** Parse a PDF file and return its page count.
 *  The ArrayBuffer is transferred to the worker, so the main thread
 *  does not keep a copy of the (possibly 300MB) file in memory. */
export async function openPdf(fileId: string, file: File): Promise<number> {
  const pdfjs = await getPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data,
    // Hardware image decode (fast); its GPU frames are short-lived and
    // released page by page. Without it, pages decode in pure JS at
    // 100-300ms per scanned page.
    isImageDecoderSupported: USE_HARDWARE_DECODE,
    // But no OffscreenCanvas in the worker: those are the persistent
    // GPU-backed surfaces that accumulated and made the browser flicker.
    isOffscreenCanvasSupported: false,
    // Wasm decoders (JBIG2 / JPEG2000 / color profiles), served from
    // public/. Without this, JBIG2 scans render as blank thumbnails.
    // Copied from node_modules/pdfjs-dist/wasm — re-copy after upgrades.
    wasmUrl: "/pdfjs/wasm/",
  }).promise;
  docs.set(fileId, doc);
  return doc.numPages;
}

/** Free everything associated with a file: queued renders, worker memory
 *  and thumbnail blobs. */
export function closePdf(fileId: string) {
  // Drop queued render jobs for this file.
  for (const [key, job] of jobs) {
    if (job.fileId === fileId) {
      jobs.delete(key);
      job.reject(new Error("file removed"));
    }
  }
  drainQueue(priorityQueue, fileId);
  drainQueue(backgroundQueue, fileId);
  progress.delete(fileId);

  // v6 API: destroying the loading task frees the document and its
  // worker memory (PDFDocumentProxy no longer has its own destroy()).
  docs.get(fileId)?.loadingTask.destroy();
  docs.delete(fileId);

  for (const [key, url] of thumbs) {
    if (key.startsWith(fileId + ":")) {
      URL.revokeObjectURL(url);
      thumbs.delete(key);
    }
  }
}

function drainQueue(queue: string[], fileId: string) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].startsWith(fileId + ":")) queue.splice(i, 1);
  }
}

/* ------------------------------------------------------------------ */
/* Thumbnail rendering                                                */
/*                                                                    */
/* All rendering funnels through ONE global queue with a fixed number */
/* of runners and reused canvases. Pages a user scrolls past are      */
/* never rendered twice, work never piles up faster than it can run,  */
/* and canvas/GPU memory stays flat no matter how fast you scroll.    */
/* ------------------------------------------------------------------ */

/* Tuning knobs for the loading pipeline. If black-screen flicker ever
 * returns on weaker GPUs, set USE_HARDWARE_DECODE to false (much slower
 * but zero GPU usage) or raise PAGE_PACING_MS. */

/** Decode page images with the browser's hardware decoder (WebCodecs). */
const USE_HARDWARE_DECODE = true;

/** Pause between pages during loading. Acts as backpressure: gives the
 *  browser time to release each page's transient decode memory (and to
 *  paint the progress bar) before the next page starts. */
const PAGE_PACING_MS = 25;

/** Width in px that pages are rasterized at — small keeps memory low
 *  while staying sharp enough for a 4-column grid. */
const THUMB_WIDTH = 320;

/** Exactly one render loop: the worker parses pages one at a time anyway,
 *  and a single loop means periodic `doc.cleanup()` calls always succeed
 *  (they throw if another render is in flight) and only one decoded
 *  full-resolution page image exists at any moment. */
const MAX_RUNNERS = 1;

/** Ask the worker to release decoded fonts/images every N pages. A scanned
 *  page decodes to ~35MB of bitmap, so keep this small to cap the
 *  worst-case accumulation between cleanups. */
const CLEANUP_EVERY = 4;

/** Finished thumbnails as blob URLs, keyed by "fileId:pageIndex".
 *  Compressed JPEG blobs are cheap (Chrome can spill them to disk),
 *  which is what makes preloading 1000+ pages viable. */
const thumbs = new Map<string, string>();

type Job = {
  fileId: string;
  pageIndex: number;
  promise: Promise<string>;
  resolve: (url: string) => void;
  reject: (err: unknown) => void;
};

/** Pending jobs by key, plus two queues: pages visible on screen jump
 *  ahead of the background preload. */
const jobs = new Map<string, Job>();
const priorityQueue: string[] = [];
const backgroundQueue: string[] = [];
let activeRunners = 0;

/** While a drag is in progress the background preload is paused so the
 *  main thread stays free for smooth auto-scrolling. */
let prefetchPaused = false;
export function setPrefetchPaused(paused: boolean) {
  prefetchPaused = paused;
  if (!paused) pump();
}

/* ----- progress reporting (drives the "preparing previews" UI) ----- */

const progress = new Map<string, { done: number; total: number }>();
type ProgressListener = (fileId: string, done: number, total: number) => void;
let progressListener: ProgressListener | null = null;

export function setThumbProgressListener(cb: ProgressListener | null) {
  progressListener = cb;
}

function bumpProgress(fileId: string) {
  const entry = progress.get(fileId);
  if (!entry) return;
  entry.done++;
  progressListener?.(fileId, entry.done, entry.total);
}

/* ----- public API ----- */

export function thumbKey(fileId: string, pageIndex: number) {
  return `${fileId}:${pageIndex}`;
}

/** Synchronous cache lookup — used for instant display and drag ghosts. */
export function getCachedThumb(fileId: string, pageIndex: number) {
  return thumbs.get(thumbKey(fileId, pageIndex)) ?? null;
}

/** Queue every page of a file for background rendering. Called once
 *  when a file is opened, so scrolling later only ever hits the cache. */
export function prefetchThumbs(fileId: string, pageCount: number) {
  progress.set(fileId, { done: 0, total: pageCount });
  for (let i = 0; i < pageCount; i++) requestThumb(fileId, i, false);
}

/** Request one page's thumbnail. `visible` requests (cards on screen)
 *  are rendered before the background preload continues. */
export function requestThumb(
  fileId: string,
  pageIndex: number,
  visible = true
): Promise<string> {
  const key = thumbKey(fileId, pageIndex);
  const cached = thumbs.get(key);
  if (cached) return Promise.resolve(cached);

  let job = jobs.get(key);
  if (!job) {
    let resolve!: (url: string) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => {}); // background jobs may have no other listener
    job = { fileId, pageIndex, promise, resolve, reject };
    jobs.set(key, job);
    (visible ? priorityQueue : backgroundQueue).push(key);
  } else if (visible) {
    // Already queued in the background — promote it.
    const i = backgroundQueue.indexOf(key);
    if (i !== -1) {
      backgroundQueue.splice(i, 1);
      priorityQueue.push(key);
    }
  }

  pump();
  return job.promise;
}

/* ----- the render loop ----- */

function takeNextKey(): string | undefined {
  if (priorityQueue.length) return priorityQueue.shift();
  if (!prefetchPaused) return backgroundQueue.shift();
  return undefined;
}

function pump() {
  while (
    activeRunners < MAX_RUNNERS &&
    (priorityQueue.length || (!prefetchPaused && backgroundQueue.length))
  ) {
    activeRunners++;
    runLoop();
  }
}

/** One runner: pulls jobs until the queues are empty, reusing a single
 *  canvas the whole time so GPU memory doesn't churn. */
async function runLoop() {
  const canvas = document.createElement("canvas");
  try {
    for (;;) {
      const key = takeNextKey();
      if (!key) break;
      const job = jobs.get(key);
      if (!job) continue; // already resolved or file was removed

      const doc = docs.get(job.fileId);
      if (!doc) {
        jobs.delete(key);
        job.reject(new Error("file removed"));
        continue;
      }

      try {
        const page = await doc.getPage(job.pageIndex + 1);
        const scale = THUMB_WIDTH / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        page.cleanup(); // drop this page's decoded resources in the worker

        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
            "image/jpeg",
            0.8
          )
        );
        const url = URL.createObjectURL(blob);
        thumbs.set(key, url);
        jobs.delete(key);
        job.resolve(url);
      } catch (err) {
        jobs.delete(key);
        job.reject(err);
      }

      bumpProgress(job.fileId);

      // Backpressure: a short pause after every page so the browser can
      // free that page's transient decode memory and paint the progress
      // bar before the next page starts.
      await new Promise((resolve) => setTimeout(resolve, PAGE_PACING_MS));

      const entry = progress.get(job.fileId);
      if (entry && entry.done === entry.total) {
        // All pages processed — release the document entirely if possible.
        await finishFile(job.fileId, entry.total);
      } else if (entry && entry.done % CLEANUP_EVERY === 0) {
        // Periodically release shared decoded images/fonts in the worker.
        try {
          await doc.cleanup();
        } catch {
          /* render in flight — try again next batch */
        }
      }
    }
  } finally {
    canvas.width = 0; // release the canvas backing store immediately
    canvas.height = 0;
    activeRunners--;
  }
}

/** Once every page of a file has a cached thumbnail, the pdf.js document
 *  (and the ~file-sized buffer it holds in the worker) is no longer
 *  needed — all display comes from the blob cache, and export re-reads
 *  the original file from disk. Freeing it here is why memory drops to
 *  almost nothing after the loading screen finishes. */
async function finishFile(fileId: string, total: number) {
  for (let i = 0; i < total; i++) {
    if (!thumbs.has(thumbKey(fileId, i))) return; // a page failed — keep the doc
  }
  const doc = docs.get(fileId);
  docs.delete(fileId);
  try {
    await doc?.loadingTask.destroy();
  } catch {
    /* already destroyed */
  }
}

/* ------------------------------------------------------------------ */
/* Export — rebuild a single PDF in the arranged page order            */
/* ------------------------------------------------------------------ */

/** Assemble the current arrangement into one PDF blob using pdf-lib.
 *  Source bytes are re-read from disk here, so they are only held in
 *  memory for the duration of the export. */
export async function exportPdf(files: PdfFile[], pages: PageRef[]): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();

  // Copy all needed pages from each source file in one pass.
  const copied = new Map<string, import("pdf-lib").PDFPage>();
  for (const f of files) {
    const indices = pages.filter((p) => p.fileId === f.id).map((p) => p.pageIndex);
    if (indices.length === 0) continue;

    const src = await PDFDocument.load(await f.file.arrayBuffer(), {
      ignoreEncryption: true,
    });
    const srcPages = await out.copyPages(src, indices);
    srcPages.forEach((pg, i) => copied.set(thumbKey(f.id, indices[i]), pg));
  }

  // Add pages in the order they appear in the grid.
  for (const p of pages) {
    const pg = copied.get(thumbKey(p.fileId, p.pageIndex));
    if (pg) out.addPage(pg);
  }

  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

/** Trigger a browser download for an exported blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
