import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageInfo } from "./types";

/* ------------------------------------------------------------------ */
/* Page rendering for the editor.                                     */
/*                                                                    */
/* Self-contained like lib/compress.ts — its own pdf.js load and one  */
/* open document — so nothing here touches the organizer's tuned      */
/* thumbnail pipeline. Pages render one at a time into a single       */
/* reused canvas and are kept as JPEG blob URLs, so memory stays flat */
/* on phones no matter how far you scroll.                            */
/* ------------------------------------------------------------------ */

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** iOS Safari refuses canvases above ~16.7M pixels; stay well under. */
const MAX_CANVAS_PIXELS = 12_000_000;

/** Rendered pages kept around for scrolling back (LRU). */
const CACHE_SIZE = 12;

/** Ask the worker to drop decoded fonts/images every N renders. */
const CLEANUP_EVERY = 4;

let doc: PDFDocumentProxy | null = null;
let canvas: HTMLCanvasElement | null = null;
let queue: Promise<unknown> = Promise.resolve();
let renders = 0;
const cache = new Map<string, string>(); // "page:width" → blob URL

/** Open a PDF for editing (closing any previous one) and return every
 *  page's displayed size in points. */
export async function openEditorDoc(file: File): Promise<PageInfo[]> {
  closeEditorDoc();
  const pdfjs = await getPdfjs();
  const opened = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
    // Same tuned options as the organizer — see lib/pdf.ts for why
    isImageDecoderSupported: true,
    isOffscreenCanvasSupported: false,
    wasmUrl: "/pdfjs/wasm/",
  }).promise;
  doc = opened;

  const pages: PageInfo[] = [];
  for (let i = 1; i <= opened.numPages; i++) {
    const page = await opened.getPage(i);
    const { width, height } = page.getViewport({ scale: 1 });
    pages.push({ width, height });
    page.cleanup();
  }
  return pages;
}

export function closeEditorDoc() {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  doc?.loadingTask.destroy();
  doc = null;
}

/** Render a page to a JPEG blob URL at the given pixel width. Renders run
 *  strictly one after another; `isWanted` is checked just before starting
 *  so pages scrolled past in the meantime are skipped. */
export function renderPage(
  index: number,
  pixelWidth: number,
  isWanted: () => boolean
): Promise<string | null> {
  const key = `${index}:${pixelWidth}`;
  const hit = cache.get(key);
  if (hit) {
    // Refresh its LRU position
    cache.delete(key);
    cache.set(key, hit);
    return Promise.resolve(hit);
  }

  const run = async () => {
    const current = doc;
    if (!current || !isWanted()) return null;
    const again = cache.get(key); // may have been rendered while queued
    if (again) return again;

    const page = await current.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    let scale = pixelWidth / base.width;
    const pixels = base.width * base.height * scale * scale;
    if (pixels > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
    const viewport = page.getViewport({ scale });

    canvas ??= document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    page.cleanup();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas!.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (++renders % CLEANUP_EVERY === 0) await current.cleanup().catch(() => {});
    if (!blob || doc !== current) return null; // doc closed mid-render

    const url = URL.createObjectURL(blob);
    cache.set(key, url);
    while (cache.size > CACHE_SIZE) {
      const [oldKey, oldUrl] = cache.entries().next().value!;
      cache.delete(oldKey);
      URL.revokeObjectURL(oldUrl);
    }
    return url;
  };

  const result = queue.then(run, run);
  queue = result.catch(() => null);
  return result;
}

/** How to turn displayed page positions into real PDF coordinates for
 *  one page — used when saving. Handles rotation, crop offsets and
 *  UserUnit via pdf.js's own viewport maths. */
export async function getPageTransform(index: number) {
  if (!doc) throw new Error("No document open");
  const page = await doc.getPage(index + 1);
  const viewport = page.getViewport({ scale: 1 });
  const unit = page.userUnit || 1;
  return {
    rotation: page.rotate,
    /** Points on screen → PDF user-space units. */
    unit,
    toPdf: (x: number, y: number) => {
      const [px, py] = viewport.convertToPdfPoint(x, y) as [number, number];
      return { x: px, y: py };
    },
  };
}
