import type { FontKey } from "./types";

/** Line height for multi-line text, as a multiple of the font size —
 *  used by both the on-screen box and the saved PDF so they line up. */
export const LINE_HEIGHT = 1.2;

/** The three standard PDF fonts, with the closest screen font for each.
 *
 *  `baseline` is where the first line's baseline sits, from the top of
 *  the text box, as a fraction of the font size. It's the CSS half-leading
 *  plus the screen font's ascent (e.g. Arial: (1.2 − 1.117) / 2 + 0.905),
 *  so text lands in the PDF where it was shown on screen. */
export const FONTS: Record<
  FontKey,
  { label: string; css: string; pdf: "Helvetica" | "Times-Roman" | "Courier"; baseline: number }
> = {
  sans: {
    label: "Sans",
    css: 'Helvetica, Arial, "Liberation Sans", sans-serif',
    pdf: "Helvetica",
    baseline: 0.9465,
  },
  serif: {
    label: "Serif",
    css: '"Times New Roman", Times, "Liberation Serif", serif',
    pdf: "Times-Roman",
    baseline: 0.9375,
  },
  mono: {
    label: "Mono",
    css: '"Courier New", Courier, "Liberation Mono", monospace',
    pdf: "Courier",
    baseline: 0.8665,
  },
};

export const TEXT_COLORS = ["#111827", "#1d4ed8", "#dc2626"];
