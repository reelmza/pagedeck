import { createCanvas, dotGrid, fit, glow, loadLogo, readTheme, spaced, toPng } from "./canvas";
import { MERCHANT_NAME, SITE_URL } from "./site";

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

// 4:5 — just taller than square (also Instagram's portrait feed size)
export const RECEIPT_WIDTH = 1080;
export const RECEIPT_HEIGHT = 1350;

/** "₦5,000.00" (or "USD 5.00" for other currencies). */
export function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    currencyDisplay: currency === "NGN" ? "narrowSymbol" : "code",
  }).format(amount);
}

/** "jane.doe@gmail.com" → "ja•••@gmail.com" — the image is meant to be
 *  posted publicly, so the full address stays off it. */
function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 2)}•••@${domain}`;
}

/** Draws the receipt as a portrait PNG, entirely in the browser. */
export async function renderReceipt(receipt: Receipt): Promise<Blob> {
  const W = RECEIPT_WIDTH;
  const H = RECEIPT_HEIGHT;

  // Reuse the app's theme and font so the image matches the site
  const { accent: ACCENT, ink: INK, muted: MUTED, border: BORDER, font: FONT } =
    await readTheme();
  const { canvas, ctx } = createCanvas(W, H);

  // --- Backdrop: accent gradient, soft glows and a faint dot grid -------
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1e3a8a");
  bg.addColorStop(0.55, ACCENT);
  bg.addColorStop(1, "#60a5fa");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W * 0.85, H * 0.08, 520, "rgba(255,255,255,0.18)");
  glow(ctx, W * 0.1, H * 0.95, 640, "rgba(255,255,255,0.14)");

  dotGrid(ctx, "rgba(255,255,255,0.09)");

  // --- Header: check badge + thank-you line ------------------------------
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(W / 2, 84, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 17, 85);
  ctx.lineTo(W / 2 - 5, 98);
  ctx.lineTo(W / 2 + 18, 72);
  ctx.stroke();

  // First name only — unless we only have their email to go on
  const firstName = receipt.name.includes("@") ? "" : receipt.name.split(/\s+/)[0];
  const headline = firstName ? `Thank you, ${firstName}!` : "Thank you!";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 60px ${FONT}`;
  ctx.fillText(fit(ctx, headline, W - 160), W / 2, 192);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `400 28px ${FONT}`;
  ctx.fillText("Your tip keeps PageDeck free, offline & ad-free.", W / 2, 238);

  // --- Ticket card (drawn on its own layer so the notches cut through) --
  const cardX = 64;
  const cardY = 280;
  const cardW = W - cardX * 2;
  const cardH = 990;
  const { canvas: card, ctx: c } = createCanvas(W, H);

  c.fillStyle = "#ffffff";
  c.beginPath();
  c.roundRect(cardX, cardY, cardW, cardH, 48);
  c.fill();

  const padL = cardX + 64;
  const padR = cardX + cardW - 64;
  const cx = W / 2;

  // Logo
  const logo = await loadLogo();
  if (logo) {
    const lw = 260;
    const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
    c.drawImage(logo, cx - lw / 2, cardY + 56, lw, lh);
  }

  // Amount block
  c.textAlign = "center";
  spaced(c, 5);
  c.fillStyle = MUTED;
  c.font = `600 24px ${FONT}`;
  c.fillText("AMOUNT PAID", cx, cardY + 182);
  spaced(c, 0);
  c.fillStyle = ACCENT;
  c.font = `700 96px ${FONT}`;
  const amount = formatAmount(receipt.amount, receipt.currency);
  c.fillText(fit(c, amount, cardW - 120), cx, cardY + 272);
  c.fillStyle = MUTED;
  c.font = `400 28px ${FONT}`;
  c.fillText(receipt.paidAt, cx, cardY + 322);

  // Perforation — dashed line between two notches cut from the card
  const perfY = cardY + 380;
  c.strokeStyle = BORDER;
  c.lineWidth = 4;
  c.setLineDash([16, 14]);
  c.beginPath();
  c.moveTo(cardX + 56, perfY);
  c.lineTo(cardX + cardW - 56, perfY);
  c.stroke();
  c.setLineDash([]);
  c.globalCompositeOperation = "destination-out";
  for (const x of [cardX, cardX + cardW]) {
    c.beginPath();
    c.arc(x, perfY, 26, 0, Math.PI * 2);
    c.fill();
  }
  c.globalCompositeOperation = "source-over";

  // Detail rows
  const rows: [string, string][] = [
    ["Name", receipt.name],
    ["Email", maskEmail(receipt.email)],
    ["Payment method", receipt.method],
    ["Reference", receipt.reference],
    ["Transaction ID", receipt.transactionId],
  ];
  let y = perfY + 70;
  for (const [label, value] of rows) {
    c.textAlign = "left";
    c.fillStyle = MUTED;
    c.font = `400 28px ${FONT}`;
    c.fillText(label, padL, y);
    c.textAlign = "right";
    c.fillStyle = INK;
    c.font = `600 29px ${FONT}`;
    c.fillText(fit(c, value, 500), padR, y);
    y += 64;
  }

  // Status — plain green text
  c.textAlign = "left";
  c.fillStyle = MUTED;
  c.font = `400 28px ${FONT}`;
  c.fillText("Status", padL, y);
  c.textAlign = "right";
  c.fillStyle = "#16a34a";
  c.font = `700 29px ${FONT}`;
  c.fillText("Paid", padR, y);

  // Total
  y += 38;
  c.fillStyle = BORDER;
  c.fillRect(padL, y, padR - padL, 3);
  y += 60;
  c.fillStyle = INK;
  c.font = `700 36px ${FONT}`;
  c.textAlign = "left";
  c.fillText("Total", padL, y);
  c.textAlign = "right";
  c.fillText(amount, padR, y);

  // Card footer
  c.textAlign = "center";
  c.fillStyle = MUTED;
  c.font = `400 24px ${FONT}`;
  c.fillText(`Paid to ${MERCHANT_NAME} · Secured by Paystack`, cx, cardY + cardH - 40);

  // Drop the card onto the backdrop with a soft shadow
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.30)";
  ctx.shadowBlur = 56;
  ctx.shadowOffsetY = 18;
  ctx.drawImage(card, 0, 0);
  ctx.restore();

  // --- Site name under the card -----------------------------------------
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(new URL(SITE_URL).host, W / 2, 1318);

  return toPng(canvas);
}

export function receiptFileName(receipt: Receipt) {
  return `PageDeck-receipt-${receipt.reference}.png`;
}
