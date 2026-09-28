import type { EditorImage } from "./types";

/** Uploaded images are scaled down to this many pixels on the long side —
 *  plenty for a page, and keeps phones from choking on 12MP photos. */
const MAX_IMAGE_SIDE = 2000;

export function newId(prefix: string) {
  // crypto.randomUUID needs HTTPS; fall back for LAN testing over HTTP
  return crypto.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Canvas → EditorImage (PNG keeps transparency; JPEG for photos). */
export async function canvasToImage(
  canvas: HTMLCanvasElement,
  type: "png" | "jpg" = "png"
): Promise<EditorImage> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type === "png" ? "image/png" : "image/jpeg", 0.9)
  );
  if (!blob) throw new Error("Couldn't encode image");
  return {
    id: newId("img"),
    bytes: new Uint8Array(await blob.arrayBuffer()),
    type,
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  };
}

/** Decode a user's image file into a (downscaled) canvas. */
export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file); // honours EXIF rotation
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** A plain image to place on the page — PNG if it has transparency,
 *  otherwise JPEG (much smaller for photos). */
export async function imageFromFile(file: File): Promise<EditorImage> {
  const canvas = await fileToCanvas(file);
  return canvasToImage(canvas, hasTransparency(canvas) ? "png" : "jpg");
}

/** For a photo of a signature on paper: makes the paper transparent,
 *  leaving just the ink. Pixels brighter than the paper threshold vanish,
 *  with a soft ramp so ink edges stay smooth. Works in place. */
export function removePaperBackground(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const SOLID = 120; // at or below: full ink
  const PAPER = 190; // at or above: fully transparent
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const alpha = lum <= SOLID ? 1 : lum >= PAPER ? 0 : (PAPER - lum) / (PAPER - SOLID);
    d[i + 3] = Math.round(d[i + 3] * alpha);
  }
  ctx.putImageData(img, 0, 0);
}

/** Crops away fully transparent edges (with a little padding). Returns a
 *  new canvas, or null if nothing is drawn at all. */
export function trimTransparent(canvas: HTMLCanvasElement, pad = 8): HTMLCanvasElement | null {
  const { width, height } = canvas;
  const d = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (d[(y * width + x) * 4 + 3] > 12) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  if (right < 0) return null;

  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d")!.drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function hasTransparency(canvas: HTMLCanvasElement) {
  const d = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

/* --------------- remembered signature (this device only) --------------- */

const SIGNATURE_KEY = "pagedeck:signature";

export function saveSignature(canvas: HTMLCanvasElement) {
  try {
    localStorage.setItem(SIGNATURE_KEY, canvas.toDataURL("image/png"));
  } catch {
    // Private mode / storage full — remembering is just a convenience
  }
}

export function loadSavedSignature(): string | null {
  try {
    return localStorage.getItem(SIGNATURE_KEY);
  } catch {
    return null;
  }
}

export function forgetSignature() {
  try {
    localStorage.removeItem(SIGNATURE_KEY);
  } catch {}
}

/** data: URL (the saved signature) → canvas. */
export function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
