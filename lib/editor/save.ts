import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { FONTS, fontBaseline, fontFile, fontWeight, LINE_HEIGHT, pdfFontName } from "./fonts";
import { getPageTransform } from "./render";
import { editPageText } from "./textedit";
import type { EditorItem, TextRemoval } from "./types";

/** Removes replaced text from the pages, then writes every item into the
 *  page content (flattened — not annotations, so signatures can't be
 *  moved or deleted in other apps) and returns the new PDF. The original
 *  file is re-read from disk. */
export async function saveEditedPdf(
  file: File,
  items: EditorItem[],
  removals: TextRemoval[]
): Promise<Blob> {
  const { PDFDocument, pushGraphicsState, popGraphicsState, degrees, rgb } =
    await import("pdf-lib");

  const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  if (pdf.isEncrypted) {
    throw new Error("This PDF is password-protected, so it can't be edited here.");
  }

  const fonts = new Map<string, PDFFont>();
  let fontkitReady = false;
  const images = new Map<string, PDFImage>();
  // (Map.groupBy would do this, but it's missing on iOS < 17.4)
  const byPage = new Map<number, EditorItem[]>();
  for (const item of items) byPage.set(item.page, [...(byPage.get(item.page) ?? []), item]);
  const removedByPage = new Map<number, TextRemoval[]>();
  for (const r of removals) removedByPage.set(r.page, [...(removedByPage.get(r.page) ?? []), r]);

  for (const index of new Set([...byPage.keys(), ...removedByPage.keys()])) {
    const page = pdf.getPage(index);
    const pageItems = byPage.get(index) ?? [];
    const pageRemovals = removedByPage.get(index) ?? [];

    // 1. Take the replaced text out of the page's drawing commands
    const { counts } = pageRemovals.length
      ? editPageText(pdf.context, page.node, pageRemovals.map((r) => r.target), "remove")
      : { counts: [] as number[] };

    isolateExistingContent(page);
    const { rotation, unit, toPdf } = await getPageTransform(index);
    const rotate = degrees(rotation);

    // 2. Anything that couldn't be removed gets covered in its background colour
    pageRemovals.forEach((r, k) => {
      if (counts[k]) return;
      const at = toPdf(r.rect.x, r.rect.y + r.rect.h);
      page.drawRectangle({
        ...at,
        width: r.rect.w / unit,
        height: r.rect.h / unit,
        color: hexToRgb(r.coverColor, rgb),
        rotate,
      });
    });

    // 3. New content on top

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
      } else if (item.kind === "image" || item.kind === "patch") {
        // (a smart-erase box still being computed has no image yet)
        if (!item.image) continue;
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
        const def = FONTS[item.font];
        const bold = fontWeight(item.font, item.bold) === 700;
        const cacheKey = def.standard ? pdfFontName(item.font, bold, item.italic) : `${item.font}:${bold}`;
        let font = fonts.get(cacheKey);
        if (!font) {
          if (def.standard) {
            font = await pdf.embedFont(cacheKey);
          } else {
            if (!fontkitReady) {
              pdf.registerFontkit((await import("@pdf-lib/fontkit")).default);
              fontkitReady = true;
            }
            // Subset when fontkit handles the font cleanly, else embed it whole
            font = await pdf.embedFont(await fontFile(item.font, bold), { subset: !def.fullEmbed });
          }
          fonts.set(cacheKey, font);
        }
        const color = hexToRgb(item.color, rgb);
        const firstBaseline = await fontBaseline(item.font, bold);
        // Built-in fonts have real italics; bundled ones get the same slant
        // browsers use for synthetic italics (pdf-lib's ySkew leans glyphs)
        const slant = item.italic && !def.standard ? { ySkew: degrees(14) } : {};
        item.text.split("\n").forEach((line, i) => {
          if (!line) return;
          const baseline = (firstBaseline + i * LINE_HEIGHT) * item.size;
          const at = toPdf(item.x, item.y + baseline);
          page.drawText(encodable(line, font), {
            ...at,
            size: item.size / unit,
            font,
            color,
            rotate,
            ...slant,
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
