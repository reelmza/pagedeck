/* Shared types for the PDF editor.
 *
 * All positions and sizes are in PDF points as the page is DISPLAYED
 * (rotation applied), measured from the page's top-left corner. The
 * save step converts them to real PDF coordinates. */

/** Fonts the editor offers — see lib/editor/fonts.ts. The first three are
 *  the built-in PDF fonts; the rest are bundled (app/pdf-edit/fonts.ts). */
export type FontKey =
  | "helvetica" | "times" | "courier"
  | "inter" | "roboto" | "opensans" | "montserrat"
  | "oswald" | "bebas" | "robotocondensed" | "anton"
  | "merriweather" | "playfair" | "lora" | "garamond"
  | "robotomono" | "courierprime"
  | "dancing" | "allura" | "sacramento"
  | "indieflower" | "patrickhand";

/** Size of a page as displayed, in points. */
export interface PageInfo {
  width: number;
  height: number;
}

/** A PNG/JPEG ready to show on screen and embed in the PDF. */
export interface EditorImage {
  id: string;
  bytes: Uint8Array;
  type: "png" | "jpg";
  url: string; // blob URL for display
  width: number; // pixels — only the aspect ratio matters
  height: number;
}

interface BaseItem {
  id: string;
  page: number; // zero-based page index
  x: number;
  y: number;
}

export interface TextItem extends BaseItem {
  kind: "text";
  text: string;
  size: number; // font size in points
  font: FontKey;
  color: string; // hex
  bold?: boolean;
  italic?: boolean;
  /** Set when this box replaces existing text — the TextRemoval's id. */
  replaces?: string;
}

export interface WhiteoutItem extends BaseItem {
  kind: "whiteout";
  w: number;
  h: number;
}

export interface ImageItem extends BaseItem {
  kind: "image";
  w: number;
  h: number;
  image: EditorImage;
  signature?: boolean; // only changes labels in the UI
}

/** Smart-erase box: the area under it rebuilt from its surroundings. */
export interface PatchItem extends BaseItem {
  kind: "patch";
  w: number;
  h: number;
  /** The filled-in area, once computed (recomputed after move/resize). */
  image: EditorImage | null;
  busy?: boolean;
}

export type EditorItem = TextItem | WhiteoutItem | ImageItem | PatchItem;

export type Tool = "select" | "text" | "edittext" | "whiteout" | "erase";

/** Fields an edit can change on an item (whichever apply to its kind). */
export type ItemPatch = Partial<{
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  text: string;
  font: FontKey;
  color: string;
  bold: boolean;
  italic: boolean;
}>;

/* ------------------------ editing existing text ------------------------ */

/** Where a line of existing text sits, in PDF user space (unrotated page
 *  coordinates): baseline origin, unit vectors along (u) and up from (v)
 *  the baseline, its length, and how far it reaches above/below. */
export interface RunTarget {
  ox: number;
  oy: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  width: number;
  asc: number; // > 0
  desc: number; // < 0
}

/** A tappable line of existing text, as found by pdf.js. */
export interface TextRun {
  id: string; // stable per page: "page:index"
  text: string;
  target: RunTarget;
  /** On-screen box in displayed page points (like item positions). */
  rect: { x: number; y: number; w: number; h: number };
  baseline: number; // displayed y of the baseline
  size: number; // font size in displayed points
  family: FontKey; // pdf.js's guess — refined from the font itself
}

/** Existing text taken out of a page. */
export interface TextRemoval {
  id: string;
  page: number;
  runId: string;
  target: RunTarget;
  rect: TextRun["rect"];
  /** Sampled background — shown until the clean preview is ready, and
   *  used as a cover if the text can't be removed from the file. */
  coverColor: string;
  /** null until checked; false = couldn't be found in the page content. */
  found: boolean | null;
}
