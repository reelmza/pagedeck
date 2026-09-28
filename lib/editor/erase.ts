import { canvasToImage } from "./images";
import type { Hole } from "./inpaint";
import type { EditorImage, PageInfo } from "./types";

/* ------------------------------------------------------------------ */
/* Smart erase — content-aware fill of a box on the rendered page.    */
/*                                                                    */
/* Only the box plus a margin of surroundings is processed (never the */
/* whole page), capped in size, and the maths runs in a web worker —  */
/* so it stays quick and the UI stays responsive on phones.           */
/* ------------------------------------------------------------------ */

/** Largest area (pixels) worked on; bigger crops are scaled down first. */
const MAX_CROP_PIXELS = 280_000;

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (d: Uint8ClampedArray) => void; reject: (e: Error) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./inpaint.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; data?: Uint8ClampedArray; error?: string }>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.data) job.resolve(e.data.data);
      else job.reject(new Error(e.data.error ?? "Fill failed"));
    };
  }
  return worker;
}

function runFill(data: Uint8ClampedArray, width: number, height: number, hole: Hole) {
  return new Promise<Uint8ClampedArray>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, data, width, height, hole }, [data.buffer]);
  });
}

/** Rebuilds the area under `rect` (displayed page points) from its
 *  surroundings in the rendered page image. Returns just the filled box. */
export async function smartErase(
  pageUrl: string,
  page: PageInfo,
  rect: { x: number; y: number; w: number; h: number }
): Promise<EditorImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = pageUrl;
  });
  const sx = img.naturalWidth / page.width;
  const sy = img.naturalHeight / page.height;

  // The box in image pixels, plus surroundings to copy from
  const hx0 = Math.max(0, Math.floor(rect.x * sx));
  const hy0 = Math.max(0, Math.floor(rect.y * sy));
  const hx1 = Math.min(img.naturalWidth, Math.ceil((rect.x + rect.w) * sx));
  const hy1 = Math.min(img.naturalHeight, Math.ceil((rect.y + rect.h) * sy));
  const margin = Math.round(Math.min(200, Math.max(28, Math.max(hx1 - hx0, hy1 - hy0) * 0.8)));
  const cx0 = Math.max(0, hx0 - margin);
  const cy0 = Math.max(0, hy0 - margin);
  const cx1 = Math.min(img.naturalWidth, hx1 + margin);
  const cy1 = Math.min(img.naturalHeight, hy1 + margin);

  // Scale big crops down (the fill is then scaled back up)
  const area = (cx1 - cx0) * (cy1 - cy0);
  const scale = area > MAX_CROP_PIXELS ? Math.sqrt(MAX_CROP_PIXELS / area) : 1;
  const cw = Math.max(1, Math.round((cx1 - cx0) * scale));
  const ch = Math.max(1, Math.round((cy1 - cy0) * scale));

  const crop = document.createElement("canvas");
  crop.width = cw;
  crop.height = ch;
  const ctx = crop.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch);

  const hole: Hole = {
    x: Math.floor((hx0 - cx0) * scale),
    y: Math.floor((hy0 - cy0) * scale),
    w: Math.max(1, Math.ceil((hx1 - hx0) * scale)),
    h: Math.max(1, Math.ceil((hy1 - hy0) * scale)),
  };
  const filled = await runFill(data.data, cw, ch, hole);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(filled), cw, ch), 0, 0);

  // Cut out just the box, back at full page resolution
  const out = document.createElement("canvas");
  out.width = Math.max(1, hx1 - hx0);
  out.height = Math.max(1, hy1 - hy0);
  out.getContext("2d")!.drawImage(crop, hole.x, hole.y, hole.w, hole.h, 0, 0, out.width, out.height);
  return canvasToImage(out, "jpg");
}
