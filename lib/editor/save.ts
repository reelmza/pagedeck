import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { FONTS, LINE_HEIGHT } from "./fonts";
import { getPageTransform } from "./render";
import type { EditorItem, FontKey } from "./types";

/** Writes every item into the page content (flattened — not annotations,
 *  so signatures can't be moved or deleted in other apps) and returns
 *  the new PDF. The original file is re-read from disk. */
export async function saveEditedPdf(file: File, items: EditorItem[]): Promise<Blob> {
  const { PDFDocument, pushGraphicsState, popGraphicsState, degrees, rgb } =
    await import("pdf-lib");

  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  if (pdf.isEncrypted) {
    throw new Error("This PDF is password-protected, so it can't be edited here.");
  }

  const fonts = new Map<FontKey, PDFFont>();
  const images = new Map<string, PDFImage>();
  // (Map.groupBy would do this, but it's missing on iOS < 17.4)
  const byPage = new Map<number, EditorItem[]>();
  for (const item of items) byPage.set(item.page, [...(byPage.get(item.page) ?? []), item]);

  for (const [index, pageItems] of byPage) {
    const page = pdf.getPage(index);
    isolateExistingContent(page);
    const { rotation, unit, toPdf } = await getPageTransform(index);
    const rotate = degrees(rotation);

    for (const item of pageItems) {
      if (item.kind === "whiteout") {
        // Anchor at the box's on-screen bottom-left; rotating by the page's
        // rotation keeps it upright on rotated pages
        const at = toPdf(item.x, item.y + item.h);
        page.drawRectangle({
          ...at,
          width: item.w / unit,
          height: item.h / unit,
          color: rgb(1, 1, 1),
          rotate,
        });
      } else if (item.kind === "image") {
        let embedded = images.get(item.image.id);
        if (!embedded) {
          embedded =
            item.image.type === "png"
              ? await pdf.embedPng(item.image.bytes)
              : await pdf.embedJpg(item.image.bytes);
          images.set(item.image.id, embedded);
        }
        const at = toPdf(item.x, item.y + item.h);
        page.drawImage(embedded, { ...at, width: item.w / unit, height: item.h / unit, rotate });
      } else {
        let font = fonts.get(item.font);
        if (!font) {
          font = await pdf.embedFont(FONTS[item.font].pdf);
          fonts.set(item.font, font);
        }
        const color = hexToRgb(item.color, rgb);
        item.text.split("\n").forEach((line, i) => {
          if (!line) return;
          const baseline = (FONTS[item.font].baseline + i * LINE_HEIGHT) * item.size;
          const at = toPdf(item.x, item.y + baseline);
          page.drawText(encodable(line, font), {
            ...at,
            size: item.size / unit,
            font,
            color,
            rotate,
          });
        });
      }
    }
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });

  /** Wraps the page's existing drawing commands in save/restore (q … Q)
   *  so any state they leave behind — e.g. a moved origin — can't
   *  shift or scale what we draw after them. */
  function isolateExistingContent(page: PDFPage) {
    page.node.normalize();
    const start = pdf.context.register(pdf.context.contentStream([pushGraphicsState()]));
    const end = pdf.context.register(pdf.context.contentStream([popGraphicsState()]));
    page.node.wrapContentStreams(start, end);
  }
}

/** The standard PDF fonts only cover Western characters — swap anything
 *  else for "?" instead of failing the whole save. */
function encodable(text: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text, (ch) => (supported.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function hexToRgb(hex: string, rgb: typeof import("pdf-lib").rgb) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
