/* ------------------------------------------------------------------ */
/* PDF compression — rasterize pages to JPEG and rebuild the file.     */
/*                                                                    */
/* Deliberately self-contained: it loads pdf.js itself (with the same */
/* tuned options as lib/pdf.ts) instead of sharing the organizer's    */
/* document map, so nothing here can interfere with the organizer's   */
/* carefully balanced thumbnail pipeline.                             */
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

export type CompressPreset = "high" | "balanced" | "small";

/** DPI the pages are re-rendered at and the JPEG quality they are
 *  re-encoded with. 72 DPI = 1 PDF point per pixel. */
export const PRESETS: Record<
  CompressPreset,
  { label: string; hint: string; dpi: number; quality: number }
> = {
  high: { label: "High quality", hint: "150 DPI · sharper, larger", dpi: 150, quality: 0.85 },
  balanced: { label: "Balanced", hint: "120 DPI · recommended", dpi: 120, quality: 0.75 },
  small: { label: "Smallest size", hint: "96 DPI · maximum savings", dpi: 96, quality: 0.6 },
};

export type CompressMethod =
  | "rasterized" // pages re-drawn as JPEGs — the intended path
  | "restructured" // rasterizing grew the file; structural re-save won instead
  | "original"; // nothing produced a smaller file — original returned as-is

export type CompressResult = {
  blob: Blob;
  originalSize: number;
  method: CompressMethod;
};

/** iOS Safari refuses canvases above ~16.7M pixels; stay under it so a
 *  huge page silently renders at reduced DPI instead of failing. */
const MAX_CANVAS_PIXELS = 16_000_000;

/** Pause between pages: lets the browser release each page's transient
 *  decode memory and paint the progress bar (same idea as lib/pdf.ts). */
const PAGE_PACING_MS = 15;

/** Ask the pdf.js worker to release decoded images/fonts every N pages. */
const CLEANUP_EVERY = 4;

/** Compress one PDF. Renders every page to a JPEG at the preset's DPI and
 *  rebuilds the document from those images. Guarded: if the rebuilt file
 *  is not smaller, falls back to a structural re-save, and failing that
 *  returns the original untouched — the result is never worse than the
 *  input. `onProgress` fires after each page. */
export async function compressPdf(
  file: File,
  preset: CompressPreset,
  onProgress: (done: number, total: number) => void
): Promise<CompressResult> {
  const { dpi, quality } = PRESETS[preset];
  const pdfjs = await getPdfjs();

  // The ArrayBuffer is transferred to the worker (main thread keeps no
  // copy); the fallbacks below re-read the file from disk when needed.
  const doc = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
    isImageDecoderSupported: true,
    isOffscreenCanvasSupported: false,
    wasmUrl: "/pdfjs/wasm/",
  }).promise;

  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  // One canvas reused for every page so GPU memory doesn't churn.
  const canvas = document.createElement("canvas");

  try {
    const total = doc.numPages;
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      // scale-1 viewport = page size in points with rotation applied, so
      // rotated pages come out upright and keep their visual dimensions.
      const base = page.getViewport({ scale: 1 });

      let scale = dpi / 72;
      const pixels = base.width * base.height * scale * scale;
      if (pixels > MAX_CANVAS_PIXELS) {
        scale = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
      }
      const viewport = page.getViewport({ scale });

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      page.cleanup(); // drop this page's decoded resources in the worker

      const jpeg = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("JPEG encoding failed"))),
          "image/jpeg",
          quality
        )
      );

      const image = await out.embedJpg(await jpeg.arrayBuffer());
      const pg = out.addPage([base.width, base.height]);
      pg.drawImage(image, {
        x: 0,
        y: 0,
        width: base.width,
        height: base.height,
      });

      onProgress(i, total);
      await new Promise((resolve) => setTimeout(resolve, PAGE_PACING_MS));
      if (i % CLEANUP_EVERY === 0) {
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
    try {
      await doc.loadingTask.destroy();
    } catch {
      /* already destroyed */
    }
  }

  const raster = await out.save({ useObjectStreams: true });
  if (raster.byteLength < file.size) {
    return {
      blob: new Blob([raster as BlobPart], { type: "application/pdf" }),
      originalSize: file.size,
      method: "rasterized",
    };
  }

  // Rasterizing grew the file — typical for digital/text PDFs. Try a
  // plain structural re-save instead (keeps text selectable).
  try {
    const src = await PDFDocument.load(await file.arrayBuffer(), {
      ignoreEncryption: true,
    });
    const restructured = await src.save({ useObjectStreams: true });
    if (restructured.byteLength < file.size) {
      return {
        blob: new Blob([restructured as BlobPart], { type: "application/pdf" }),
        originalSize: file.size,
        method: "restructured",
      };
    }
  } catch {
    /* unreadable by pdf-lib — fall through to the original */
  }

  return { blob: file, originalSize: file.size, method: "original" };
}
