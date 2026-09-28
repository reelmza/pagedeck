import type { PageInfo, TextRun } from "./types";

/** Median colour of a thin ring just outside a text box on the rendered
 *  page — a good stand-in for "the background behind this text". */
export async function sampleBackground(pageUrl: string, page: PageInfo, rect: TextRun["rect"]): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = pageUrl;
    });
    const sx = img.naturalWidth / page.width;
    const sy = img.naturalHeight / page.height;
    const pad = Math.max(2, rect.h * 0.25);
    const x0 = Math.max(0, Math.floor((rect.x - pad) * sx));
    const y0 = Math.max(0, Math.floor((rect.y - pad) * sy));
    const x1 = Math.min(img.naturalWidth, Math.ceil((rect.x + rect.w + pad) * sx));
    const y1 = Math.min(img.naturalHeight, Math.ceil((rect.y + rect.h + pad) * sy));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return "#ffffff";

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;

    // Only pixels in the padding ring, not inside the text box itself
    const ix0 = (rect.x - x0 / sx) * sx;
    const iy0 = (rect.y - y0 / sy) * sy;
    const ix1 = ix0 + rect.w * sx;
    const iy1 = iy0 + rect.h * sy;
    const r: number[] = [];
    const g: number[] = [];
    const b: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= ix0 && x < ix1 && y >= iy0 && y < iy1) continue;
        const k = (y * w + x) * 4;
        r.push(d[k]);
        g.push(d[k + 1]);
        b.push(d[k + 2]);
      }
    }
    if (!r.length) return "#ffffff";
    const hex = (v: number[]) => median(v).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return "#ffffff";
  }
}

function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
