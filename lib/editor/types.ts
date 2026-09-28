/* Shared types for the PDF editor.
 *
 * All positions and sizes are in PDF points as the page is DISPLAYED
 * (rotation applied), measured from the page's top-left corner. The
 * save step converts them to real PDF coordinates. */

export type FontKey = "sans" | "serif" | "mono";

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

export type EditorItem = TextItem | WhiteoutItem | ImageItem;

export type Tool = "select" | "text" | "whiteout";

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
}>;
