/** Small canvas helpers shared by the receipt and supporter badge images. */

const LOGO_URL = "/images/app-assets/PageDeck_Logo_NoBG.svg";

/** The app's theme colors and font, read live so images match the site. */
export async function readTheme() {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    root.getPropertyValue(name).trim() || fallback;
  await document.fonts.ready;
  return {
    accent: v("--accent", "#2563eb"),
    ink: v("--foreground", "#1e293b"),
    muted: v("--muted", "#64748b"),
    border: v("--border", "#e2e8f0"),
    font: getComputedStyle(document.body).fontFamily || "sans-serif",
  };
}

export function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d")! };
}

export function toPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** The full PageDeck wordmark logo as an image (null if it fails). */
export function loadLogo() {
  return loadImage(LOGO_URL).catch(() => null);
}

/** Just the PageDeck icon (the page stack, without the wordmark) as vector
 *  paths — it's the paths in the logo SVG that start left of the text. */
export async function loadLogoIcon() {
  try {
    const svg = await (await fetch(LOGO_URL)).text();
    const paths: { fill: string; path: Path2D }[] = [];
    for (const [, fill, d] of svg.matchAll(/<path fill="(#[0-9a-f]{6})" d="([^"]+)"/gi)) {
      const startX = parseFloat(d.slice(1));
      if (startX < 200) paths.push({ fill, path: new Path2D(d) });
    }
    // Icon bounds in the SVG's coordinate space
    return { paths, width: 190, height: 173 };
  } catch {
    return null;
  }
}

/** Soft radial light blob. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Faint dot grid across the whole canvas (same look as the site hero). */
export function dotGrid(ctx: CanvasRenderingContext2D, color: string) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = color;
  for (let y = 18; y < height; y += 36) {
    for (let x = 18; x < width; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Letter spacing where the browser supports it (ignored elsewhere). */
export function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

/** Truncates with "…" so text never runs past maxWidth. */
export function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
  return s + "…";
}
