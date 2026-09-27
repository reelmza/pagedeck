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
const LOGO_URL = "/images/app-assets/PageDeck_Logo_NoBG.svg";

// 9:16 — the story format for WhatsApp Status / Instagram / Facebook
export const RECEIPT_WIDTH = 1080;
export const RECEIPT_HEIGHT = 1920;

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

/** Draws the receipt as a tall PNG, entirely in the browser. */
export async function renderReceipt(receipt: Receipt): Promise<Blob> {
  const W = RECEIPT_WIDTH;
  const H = RECEIPT_HEIGHT;

  // Reuse the app's theme and font so the image matches the site
  const root = getComputedStyle(document.documentElement);
  const theme = (name: string, fallback: string) =>
    root.getPropertyValue(name).trim() || fallback;
  const ACCENT = theme("--accent", "#2563eb");
  const INK = theme("--foreground", "#1e293b");
  const MUTED = theme("--muted", "#64748b");
  const BORDER = theme("--border", "#e2e8f0");
  const FONT = getComputedStyle(document.body).fontFamily || "sans-serif";
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // --- Backdrop: accent gradient, soft glows and a faint dot grid -------
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1e3a8a");
  bg.addColorStop(0.55, ACCENT);
  bg.addColorStop(1, "#60a5fa");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  glow(ctx, W * 0.85, H * 0.08, 520, "rgba(255,255,255,0.18)");
  glow(ctx, W * 0.1, H * 0.95, 640, "rgba(255,255,255,0.14)");

  ctx.fillStyle = "rgba(255,255,255,0.09)";
  for (let y = 18; y < H; y += 36) {
    for (let x = 18; x < W; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Header: check badge + thank-you line ------------------------------
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(W / 2, 200, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 26, 202);
  ctx.lineTo(W / 2 - 7, 222);
  ctx.lineTo(W / 2 + 28, 182);
  ctx.stroke();

  // First name only — unless we only have their email to go on
  const firstName = receipt.name.includes("@") ? "" : receipt.name.split(/\s+/)[0];
  const headline = firstName ? `Thank you, ${firstName}!` : "Thank you!";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText(fit(ctx, headline, W - 160), W / 2, 368);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `400 34px ${FONT}`;
  ctx.fillText("Your tip keeps PageDeck free, offline & ad-free.", W / 2, 426);

  // --- Ticket card (drawn on its own layer so the notches cut through) --
  const cardX = 80;
  const cardY = 490;
  const cardW = W - cardX * 2;
  const cardH = 1270;
  const card = document.createElement("canvas");
  card.width = W;
  card.height = H;
  const c = card.getContext("2d")!;

  c.fillStyle = "#ffffff";
  c.beginPath();
  c.roundRect(cardX, cardY, cardW, cardH, 48);
  c.fill();

  const padL = cardX + 72;
  const padR = cardX + cardW - 72;
  const cx = W / 2;

  // Logo
  const logo = await loadImage(LOGO_URL).catch(() => null);
  if (logo) {
    const lw = 330;
    const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
    c.drawImage(logo, cx - lw / 2, cardY + 80, lw, lh);
  }

  // Amount block
  c.textAlign = "center";
  spaced(c, 6);
  c.fillStyle = MUTED;
  c.font = `600 26px ${FONT}`;
  c.fillText("AMOUNT PAID", cx, cardY + 240);
  spaced(c, 0);
  c.fillStyle = ACCENT;
  c.font = `700 112px ${FONT}`;
  const amount = formatAmount(receipt.amount, receipt.currency);
  c.fillText(fit(c, amount, cardW - 120), cx, cardY + 360);
  c.fillStyle = MUTED;
  c.font = `400 30px ${FONT}`;
  c.fillText(receipt.paidAt, cx, cardY + 420);

  // Perforation — dashed line between two notches cut from the card
  const perfY = cardY + 500;
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
    c.arc(x, perfY, 30, 0, Math.PI * 2);
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
  let y = perfY + 90;
  for (const [label, value] of rows) {
    c.textAlign = "left";
    c.fillStyle = MUTED;
    c.font = `400 30px ${FONT}`;
    c.fillText(label, padL, y);
    c.textAlign = "right";
    c.fillStyle = INK;
    c.font = `600 31px ${FONT}`;
    c.fillText(fit(c, value, 470), padR, y);
    y += 80;
  }

  // Status pill
  c.textAlign = "left";
  c.fillStyle = MUTED;
  c.font = `400 30px ${FONT}`;
  c.fillText("Status", padL, y);
  c.font = `600 28px ${FONT}`;
  const pillW = c.measureText("Paid").width + 70;
  c.fillStyle = "#dcfce7";
  c.beginPath();
  c.roundRect(padR - pillW, y - 38, pillW, 54, 27);
  c.fill();
  c.fillStyle = "#16a34a";
  c.beginPath();
  c.arc(padR - pillW + 26, y - 11, 7, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#15803d";
  c.textAlign = "right";
  c.fillText("Paid", padR - 22, y);

  // Total
  y += 50;
  c.fillStyle = BORDER;
  c.fillRect(padL, y, padR - padL, 3);
  y += 70;
  c.fillStyle = INK;
  c.font = `700 40px ${FONT}`;
  c.textAlign = "left";
  c.fillText("Total", padL, y);
  c.textAlign = "right";
  c.fillText(amount, padR, y);

  // Card footer
  c.textAlign = "center";
  c.fillStyle = MUTED;
  c.font = `400 26px ${FONT}`;
  c.fillText(`Paid to ${MERCHANT_NAME} · Secured by Paystack`, cx, cardY + cardH - 56);

  // Drop the card onto the backdrop with a soft shadow
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.30)";
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 24;
  ctx.drawImage(card, 0, 0);
  ctx.restore();

  // --- Site name under the card -----------------------------------------
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(new URL(SITE_URL).host, W / 2, 1850);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
}

export function receiptFileName(receipt: Receipt) {
  return `PageDeck-receipt-${receipt.reference}.png`;
}

/* ------------------------------ helpers ------------------------------ */

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Soft radial light blob. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Letter spacing where the browser supports it (ignored elsewhere). */
function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

/** Truncates with "…" so text never runs past maxWidth. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
  return s + "…";
}
