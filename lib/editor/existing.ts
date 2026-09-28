import type { PDFDocument } from "pdf-lib";
import { renderPreviewBytes } from "./render";
import { editPageText, type FoundStyle } from "./textedit";
import type { RunTarget } from "./types";

/* ------------------------------------------------------------------ */
/* Editing existing text — the pdf-lib side, used while editing.      */
/*                                                                    */
/* The open file is parsed by pdf-lib once (on the first text edit)   */
/* and kept read-only. Previews copy just the one page into a tiny    */
/* new PDF, remove the text there, and render that — so what you see  */
/* is exactly what the saved file will look like.                     */
/* ------------------------------------------------------------------ */

let source: { file: File; doc: Promise<PDFDocument> } | null = null;

function getSource(file: File) {
  if (!source || source.file !== file) {
    const doc = (async () => {
      const { PDFDocument } = await import("pdf-lib");
      return PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
    })();
    source = { file, doc };
    // Don't keep a failed load around — let the next tap retry
    doc.catch(() => {
      if (source?.doc === doc) source = null;
    });
  }
  return source.doc;
}

/** Drop the parsed copy (a new file was opened or the editor closed). */
export function releaseSource() {
  source = null;
}

/** Colour and font of the text inside a target, or null if the text
 *  couldn't be located in the page's content. */
export async function analyzeRun(file: File, page: number, target: RunTarget): Promise<FoundStyle | null> {
  const src = await getSource(file);
  const { counts, styles } = editPageText(src.context, src.getPage(page).node, [target], "analyze");
  return counts[0] ? styles[0] : null;
}

/** Renders a page with the given text removed. Returns the preview image
 *  (caller revokes it) and how many glyphs were found per target. */
export async function renderRemovalPreview(
  file: File,
  page: number,
  targets: RunTarget[],
  pixelWidth: number
): Promise<{ url: string | null; counts: number[] }> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await getSource(file);
  const out = await PDFDocument.create({ updateMetadata: false });
  // copyPages brings the page's inherited size, rotation and resources along
  const [copy] = await out.copyPages(src, [page]);
  out.addPage(copy);
  const { counts } = editPageText(out.context, copy.node, targets, "remove");
  const url = await renderPreviewBytes(await out.save(), pixelWidth);
  return { url, counts };
}
