import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { downloadBlob } from "./pdf";
import { SITE_URL } from "./site";

/** Display-ready details of a confirmed tip (built server-side from
 *  Paystack's verify response). */
export interface Receipt {
  reference: string;
  transactionId: string;
  amount: number; // whole currency units (Naira)
  currency: string;
  paidAt: string; // already formatted for display
  name: string;
  email: string;
  method: string;
}

export const CONTACT_EMAIL = "moseskwagga@gmail.com";
const LOGO_URL = "/images/app-assets/PageDeck_Logo_NoBG.svg";

// PDFs can't read CSS variables — these mirror the theme in globals.css
const INK = hex("#1e293b"); // --foreground
const MUTED = hex("#64748b"); // --muted
const ACCENT = hex("#2563eb"); // --accent
const BORDER = hex("#e2e8f0"); // --border

// A4 in points
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;

/** "NGN 1,000.00" — the ₦ sign isn't in the built-in PDF fonts. */
export function formatAmount(amount: number, currency: string) {
  const n = amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${n}`;
}

/** Builds the receipt PDF in the browser and downloads it. */
export async function downloadReceipt(receipt: Receipt) {
  const doc = await PDFDocument.create();
  doc.setTitle(`PageDeck receipt ${receipt.reference}`);
  doc.setAuthor("PageDeck");

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const right = PAGE_W - MARGIN;
  const site = new URL(SITE_URL).host;
  const amount = formatAmount(receipt.amount, receipt.currency);

  /** Draws text, swapping characters the font can't encode for "?"
   *  (e.g. non-Latin names) instead of throwing. */
  const text = (
    str: string,
    x: number,
    y: number,
    { size = 10, font = regular, color = INK, align = "left" }: TextOpts = {}
  ) => {
    const safe = encodable(str, font);
    const w = font.widthOfTextAtSize(safe, size);
    page.drawText(safe, { x: align === "right" ? x - w : x, y, size, font, color });
  };
  const rule = (y: number) =>
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: right, y },
      thickness: 0.75,
      color: BORDER,
    });

  // Header — logo left, title right
  let y = PAGE_H - MARGIN;
  const logoH = await drawLogo(page, MARGIN, y, 150);
  text("RECEIPT", right, y - 20, { size: 20, font: bold, align: "right" });
  text(`No. ${receipt.reference}`, right, y - 36, { size: 9, color: MUTED, align: "right" });
  y -= Math.max(logoH, 40) + 28;
  rule(y);

  // Amount summary
  y -= 36;
  text("Amount paid", MARGIN, y, { size: 10, color: MUTED });
  y -= 30;
  text(amount, MARGIN, y, { size: 26, font: bold, color: ACCENT });
  y -= 18;
  text(`Paid on ${receipt.paidAt}`, MARGIN, y, { size: 10, color: MUTED });

  // Two columns — payer (left) and payment details (right)
  y -= 44;
  const colX = PAGE_W / 2 + 10;
  text("BILLED TO", MARGIN, y, { size: 8, font: bold, color: MUTED });
  text("PAYMENT DETAILS", colX, y, { size: 8, font: bold, color: MUTED });

  y -= 18;
  text(receipt.name, MARGIN, y, { size: 11, font: bold });
  text(receipt.email, MARGIN, y - 16, { size: 10, color: MUTED });

  const details: [string, string][] = [
    ["Reference", receipt.reference],
    ["Transaction ID", receipt.transactionId],
    ["Payment method", receipt.method],
    ["Status", "Paid"],
  ];
  let dy = y;
  for (const [label, value] of details) {
    text(label, colX, dy, { size: 9, color: MUTED });
    text(value, right, dy, { size: 9, font: bold, align: "right" });
    dy -= 16;
  }
  y = Math.min(y - 16, dy) - 36;

  // Line items
  text("DESCRIPTION", MARGIN, y, { size: 8, font: bold, color: MUTED });
  text("AMOUNT", right, y, { size: 8, font: bold, color: MUTED, align: "right" });
  y -= 10;
  rule(y);
  y -= 20;
  text("Tip to PageDeck", MARGIN, y, { size: 10 });
  text(amount, right, y, { size: 10, align: "right" });
  y -= 14;
  rule(y);
  y -= 22;
  text("Total", MARGIN, y, { size: 11, font: bold });
  text(amount, right, y, { size: 11, font: bold, align: "right" });

  // Footer
  let fy = MARGIN + 44;
  rule(fy + 20);
  text("Thank you for supporting PageDeck!", MARGIN, fy, { size: 10, font: bold });
  fy -= 15;
  text(
    "Your tip keeps PageDeck free, offline and ad-free for everyone.",
    MARGIN,
    fy,
    { size: 9, color: MUTED }
  );
  fy -= 15;
  text(`${site}  |  ${CONTACT_EMAIL}  |  Payment processed by Paystack`, MARGIN, fy, {
    size: 9,
    color: MUTED,
  });

  const bytes = await doc.save();
  downloadBlob(
    new Blob([bytes as BlobPart], { type: "application/pdf" }),
    `PageDeck-receipt-${receipt.reference}.pdf`
  );
}

interface TextOpts {
  size?: number;
  font?: PDFFont;
  color?: ReturnType<typeof rgb>;
  align?: "left" | "right";
}

/** Draws the site logo (an SVG of plain filled paths) as vector art with
 *  its top-left at (x, top). Returns the drawn height. */
async function drawLogo(page: PDFPage, x: number, top: number, width: number) {
  try {
    const svg = await (await fetch(LOGO_URL)).text();
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number);
    if (!viewBox) return 0;
    const scale = width / viewBox[2];

    // Skip the clip-path rectangle — only filled paths are artwork
    for (const [, fill, d] of svg.matchAll(/<path fill="(#[0-9a-f]{6})" d="([^"]+)"/gi)) {
      page.drawSvgPath(d, { x, y: top, scale, color: hex(fill) });
    }
    return viewBox[3] * scale;
  } catch {
    // Logo is decorative — a receipt without it beats no receipt
    return 0;
  }
}

/** Replace characters the font can't encode with "?". */
function encodable(str: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return Array.from(str, (ch) => (supported.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function hex(color: string) {
  const n = parseInt(color.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
