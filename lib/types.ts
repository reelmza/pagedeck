/** An uploaded PDF file. The raw `File` handle is kept so bytes can be
 *  re-read from disk at export time instead of being held in memory twice. */
export type PdfFile = {
  id: string;
  name: string;
  file: File;
  pageCount: number;
  /** Per-file outline color, shown on every card belonging to this file
   *  so pages stay identifiable after shuffling. */
  color: string;
};

/** One page in the global arrangement. `pageIndex` is the 0-based page
 *  position inside its source file; the array order is the current layout. */
export type PageRef = {
  id: string;
  fileId: string;
  pageIndex: number;
};
