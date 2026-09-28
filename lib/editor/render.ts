import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
import type { FontKey, PageInfo, TextRun } from "./types";

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
const runsCache = new Map<number, Promise<TextRun[]>>();

/** Same pdf.js options everywhere — see lib/pdf.ts for why. */
const DOC_OPTIONS = {
  isImageDecoderSupported: true,
  isOffscreenCanvasSupported: false,
  wasmUrl: "/pdfjs/wasm/",
};

/** Open a PDF for editing (closing any previous one) and return every
 *  page's displayed size in points. */
export async function openEditorDoc(file: File): Promise<PageInfo[]> {
  closeEditorDoc();
  const pdfjs = await getPdfjs();
  const opened = await pdfjs.getDocument({ data: await file.arrayBuffer(), ...DOC_OPTIONS }).promise;
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
  runsCache.clear();
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

    const blob = await drawPage(await current.getPage(index + 1), pixelWidth);
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

  return enqueue(run);
}

/** Renders page 1 of a small in-memory PDF (an edited-page preview) to a
 *  JPEG blob URL. The caller owns — and must revoke — the URL. */
export function renderPreviewBytes(bytes: Uint8Array, pixelWidth: number): Promise<string | null> {
  return enqueue(async () => {
    const pdfjs = await getPdfjs();
    const preview = await pdfjs.getDocument({ data: bytes, ...DOC_OPTIONS }).promise;
    try {
      const blob = await drawPage(await preview.getPage(1), pixelWidth);
      return blob ? URL.createObjectURL(blob) : null;
    } finally {
      preview.loadingTask.destroy();
    }
  });
}

/** All rendering runs one job at a time through this chain. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const result = queue.then(job, job);
  queue = result.catch(() => null);
  return result;
}

/** Draws a page into the shared canvas and encodes it as JPEG. */
async function drawPage(page: PDFPageProxy, pixelWidth: number) {
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
  return new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, "image/jpeg", 0.9));
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

/* ---------------------- existing text on a page ---------------------- */

/** Lines of existing text on a page, ready to tap-to-edit. Only text that
 *  reads left-to-right horizontally on screen is offered. Cached. */
export function getTextRuns(index: number): Promise<TextRun[]> {
  const current = doc;
  if (!current) return Promise.resolve([]);
  let hit = runsCache.get(index);
  if (!hit) {
    hit = (async () => {
      const page = await current.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      const content = await readTextContent(page);
      return groupRuns(content, index, (x, y) => {
        const [vx, vy] = viewport.convertToViewportPoint(x, y) as [number, number];
        return { x: vx, y: vy };
      });
    })().catch((err) => {
      // Don't cache a failure as "no text" — let the next look retry
      console.error("getTextRuns failed", err);
      runsCache.delete(index);
      throw err;
    });
    runsCache.set(index, hit);
  }
  return hit;
}

/** Same result as pdf.js's page.getTextContent(), but reading its stream
 *  with a plain reader loop. getTextContent() uses `for await` over a
 *  ReadableStream, which WebKit (Safari — and every iPhone browser,
 *  Chrome included) can't iterate, so it threw there and no text was
 *  found. */
async function readTextContent(page: PDFPageProxy): Promise<TextContent> {
  const reader = (page.streamTextContent() as ReadableStream<TextContent>).getReader();
  const content: TextContent = { items: [], styles: Object.create(null), lang: null };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    content.lang ??= value.lang;
    Object.assign(content.styles, value.styles);
    content.items.push(...value.items);
  }
  return content;
}

/** Joins pdf.js's text fragments into whole lines: same direction, same
 *  baseline, similar size, and no big gap between them. */
function groupRuns(
  content: TextContent,
  page: number,
  toView: (x: number, y: number) => { x: number; y: number }
): TextRun[] {
  type Line = {
    ox: number; oy: number; ux: number; uy: number; vx: number; vy: number;
    size: number; width: number; text: string; asc: number; desc: number; family: FontKey;
  };
  const lines: Line[] = [];
  let cur: Line | null = null;

  for (const raw of content.items) {
    if (!("str" in raw)) continue;
    const item = raw as TextItem;
    const style = content.styles[item.fontName];
    const [a, b, c, d, e, f] = item.transform as number[];
    const lenU = Math.hypot(a, b);
    const size = Math.hypot(c, d) || item.height;
    if (!lenU || !size || style?.vertical) {
      cur = null;
      continue;
    }
    const ux = a / lenU;
    const uy = b / lenU;
    // "Up" is perpendicular to the baseline
    const vx = -uy;
    const vy = ux;

    if (item.str) {
      const along = cur ? (e - cur.ox) * cur.ux + (f - cur.oy) * cur.uy : 0;
      const across = cur ? (e - cur.ox) * cur.vx + (f - cur.oy) * cur.vy : 0;
      const gap = cur ? along - cur.width : 0;
      const joins =
        cur &&
        Math.abs(ux - cur.ux) < 0.01 &&
        Math.abs(uy - cur.uy) < 0.01 &&
        Math.abs(across) < 0.2 * cur.size &&
        size / cur.size > 0.75 &&
        size / cur.size < 1.33 &&
        gap > -0.5 * cur.size &&
        gap < 1.2 * cur.size;

      if (joins && cur) {
        const needsSpace = gap > 0.2 * cur.size && !cur.text.endsWith(" ") && !item.str.startsWith(" ");
        cur.text += (needsSpace ? " " : "") + item.str;
        cur.width = Math.max(cur.width, along + item.width);
      } else if (item.str.trim()) {
        const ascent = style?.ascent && style.ascent > 0 ? style.ascent : 0.8;
        const descent = style?.descent && style.descent < 0 ? style.descent : -0.2;
        const fam = style?.fontFamily ?? "";
        cur = {
          ox: e, oy: f, ux, uy, vx, vy, size,
          width: item.width,
          text: item.str,
          asc: ascent * size,
          desc: descent * size,
          family: /mono/.test(fam) ? "courier" : /(^|[^-])serif/.test(fam) ? "times" : "helvetica",
        };
        lines.push(cur);
      }
    }
    if (item.hasEOL) cur = null;
  }

  const runs: TextRun[] = [];
  lines.forEach((l, k) => {
    const text = l.text.trim();
    if (!text) return;
    // Must read left-to-right, horizontally, on screen
    const p0 = toView(l.ox, l.oy);
    const p1 = toView(l.ox + l.ux, l.oy + l.uy);
    if (p1.x - p0.x < 0.95 * Math.hypot(p1.x - p0.x, p1.y - p0.y)) return;

    const corners = [
      toView(l.ox + l.vx * l.desc, l.oy + l.vy * l.desc),
      toView(l.ox + l.vx * l.asc, l.oy + l.vy * l.asc),
      toView(l.ox + l.ux * l.width + l.vx * l.desc, l.oy + l.uy * l.width + l.vy * l.desc),
      toView(l.ox + l.ux * l.width + l.vx * l.asc, l.oy + l.uy * l.width + l.vy * l.asc),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const top = toView(l.ox + l.vx * l.size, l.oy + l.vy * l.size);
    runs.push({
      id: `${page}:${k}`,
      text,
      target: { ox: l.ox, oy: l.oy, ux: l.ux, uy: l.uy, vx: l.vx, vy: l.vy, width: l.width, asc: l.asc, desc: l.desc },
      rect: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      },
      baseline: p0.y,
      size: Math.hypot(top.x - p0.x, top.y - p0.y),
      family: l.family,
    });
  });
  return runs;
}

/** Render widths snap up to these steps so small window resizes reuse
 *  the cached render instead of drawing the page again. */
const WIDTH_STEP = 200;

/** Pixel width to render a page shown `cssWidth` wide: sharp on retina
 *  screens, but capped at 2× to keep phones light. */
export function renderPixelWidth(cssWidth: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return Math.ceil((cssWidth * dpr) / WIDTH_STEP) * WIDTH_STEP;
}
