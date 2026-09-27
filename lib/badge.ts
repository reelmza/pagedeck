import { createCanvas, dotGrid, fit, glow, loadLogoIcon, readTheme, spaced, toPng } from "./canvas";
import type { Receipt } from "./receipt";
import { SITE_URL } from "./site";

// Same 4:5 size as the receipt so switching between them doesn't jump
export const BADGE_WIDTH = 1080;
export const BADGE_HEIGHT = 1350;

/** Draws the minimal "PageDeck Supporter" badge as a PNG — same blue
 *  backdrop as the receipt, just the icon, a label and the name. */
export async function renderBadge(receipt: Receipt): Promise<Blob> {
  const W = BADGE_WIDTH;
  const H = BADGE_HEIGHT;
  const cx = W / 2;
  const { accent: ACCENT, font: FONT } = await readTheme();
  const icon = await loadLogoIcon();
  const { canvas, ctx } = createCanvas(W, H);

  // Backdrop — near-solid accent blue; the overlay only nudges the
  // corners a touch darker / lighter so there's no obvious gradient
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, W, H);
  const shade = ctx.createLinearGradient(0, 0, W, H);
  shade.addColorStop(0, "rgba(0,0,0,0.08)");
  shade.addColorStop(1, "rgba(255,255,255,0.06)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  const cy = 520;
  glow(ctx, cx, cy, 560, "rgba(255,255,255,0.08)");
  dotGrid(ctx, "rgba(255,255,255,0.08)");

  // Faint concentric rings rippling out from the icon
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 2;
  for (let r = 300; r < H; r += 70) {
    circle(ctx, cx, cy, r);
    ctx.stroke();
  }

  // Icon on a white disc, with a faint halo ring
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  circle(ctx, cx, cy, 250);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.30)";
  ctx.shadowBlur = 56;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#ffffff";
  circle(ctx, cx, cy, 200);
  ctx.fill();
  ctx.restore();

  if (icon) {
    const scale = 220 / icon.width;
    ctx.save();
    ctx.translate(cx - (icon.width * scale) / 2, cy - (icon.height * scale) / 2);
    ctx.scale(scale, scale);
    for (const { fill, path } of icon.paths) {
      ctx.fillStyle = fill;
      ctx.fill(path);
    }
    ctx.restore();
  }

  // Label + name
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `600 30px ${FONT}`;
  spaced(ctx, 14);
  ctx.fillText("PAGEDECK SUPPORTER", cx + 7, 890); // +7 offsets trailing spacing
  spaced(ctx, 0);

  // Only the name — fall back to a generic line if we just have an email
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 76px ${FONT}`;
  const name = receipt.name.includes("@") ? "Thank you!" : receipt.name;
  ctx.fillText(fit(ctx, name, W - 160), cx, 985);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `400 28px ${FONT}`;
  ctx.fillText("Early access to new features", cx, 1045);

  // Badge number
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 68px ${FONT}`;
  spaced(ctx, 10);
  ctx.fillText(`No. ${badgeNumber(receipt.reference)}`, cx + 5, 1180); // +5 offsets trailing spacing
  spaced(ctx, 0);

  // Site name at the foot, as on the receipt
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(new URL(SITE_URL).host, cx, 1290);

  return toPng(canvas);
}

export function badgeFileName(receipt: Receipt) {
  return `PageDeck-supporter-${receipt.reference}.png`;
}

/** Badge number — the last six characters of the payment reference. */
export function badgeNumber(reference: string) {
  return reference.slice(-6).toUpperCase();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
