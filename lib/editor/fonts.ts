import type { FontKey } from "./types";

/** Line height for multi-line text, as a multiple of the font size —
 *  used by both the on-screen box and the saved PDF so they line up. */
export const LINE_HEIGHT = 1.2;

export const TEXT_COLORS = ["#111827", "#1d4ed8", "#dc2626"];

export type FontCategory =
  | "Standard"
  | "Sans"
  | "Tall & slim"
  | "Serif"
  | "Monospace"
  | "Script"
  | "Handwritten";

export const FONT_CATEGORIES: FontCategory[] = [
  "Standard", "Sans", "Tall & slim", "Serif", "Monospace", "Script", "Handwritten",
];

interface FontDef {
  label: string;
  category: FontCategory;
  /** Has a real bold weight (otherwise the B button is off for it). */
  bold: boolean;
  generic: "sans-serif" | "serif" | "monospace" | "cursive";
  /** Built-in PDF font: nothing to embed. `baseline` is where the first
   *  line's baseline sits from the top of the text box, as a fraction of
   *  the font size: CSS half-leading plus the screen font's ascent
   *  (e.g. Arial: (1.2 − 1.117) / 2 + 0.905). */
  standard?: { css: string; baseline: number };
  /** fontkit's subsetter garbles these, so the whole file is embedded. */
  fullEmbed?: boolean;
}

export const FONTS: Record<FontKey, FontDef> = {
  helvetica: {
    label: "Helvetica", category: "Standard", bold: true, generic: "sans-serif",
    standard: { css: 'Helvetica, Arial, "Liberation Sans", sans-serif', baseline: 0.9465 },
  },
  times: {
    label: "Times", category: "Standard", bold: true, generic: "serif",
    standard: { css: '"Times New Roman", Times, "Liberation Serif", serif', baseline: 0.9375 },
  },
  courier: {
    label: "Courier", category: "Standard", bold: true, generic: "monospace",
    standard: { css: '"Courier New", Courier, "Liberation Mono", monospace', baseline: 0.8665 },
  },
  inter: { label: "Inter", category: "Sans", bold: true, generic: "sans-serif", fullEmbed: true },
  roboto: { label: "Roboto", category: "Sans", bold: true, generic: "sans-serif" },
  opensans: { label: "Open Sans", category: "Sans", bold: true, generic: "sans-serif" },
  montserrat: { label: "Montserrat", category: "Sans", bold: true, generic: "sans-serif" },
  oswald: { label: "Oswald", category: "Tall & slim", bold: true, generic: "sans-serif" },
  bebas: { label: "Bebas Neue", category: "Tall & slim", bold: false, generic: "sans-serif" },
  robotocondensed: { label: "Roboto Condensed", category: "Tall & slim", bold: true, generic: "sans-serif" },
  anton: { label: "Anton", category: "Tall & slim", bold: false, generic: "sans-serif" },
  merriweather: { label: "Merriweather", category: "Serif", bold: true, generic: "serif" },
  playfair: { label: "Playfair Display", category: "Serif", bold: true, generic: "serif" },
  lora: { label: "Lora", category: "Serif", bold: true, generic: "serif" },
  garamond: { label: "EB Garamond", category: "Serif", bold: true, generic: "serif", fullEmbed: true },
  robotomono: { label: "Roboto Mono", category: "Monospace", bold: true, generic: "monospace" },
  courierprime: { label: "Courier Prime", category: "Monospace", bold: true, generic: "monospace" },
  dancing: { label: "Dancing Script", category: "Script", bold: true, generic: "cursive" },
  allura: { label: "Allura", category: "Script", bold: false, generic: "cursive" },
  sacramento: { label: "Sacramento", category: "Script", bold: false, generic: "cursive" },
  indieflower: { label: "Indie Flower", category: "Handwritten", bold: false, generic: "cursive" },
  patrickhand: { label: "Patrick Hand", category: "Handwritten", bold: false, generic: "cursive", fullEmbed: true },
};

export const FONT_KEYS = Object.keys(FONTS) as FontKey[];

/* ------------------------- matching originals ------------------------- */

/** Original font name → closest font we offer. Most specific first. */
const MATCHERS: [RegExp, FontKey][] = [
  [/roboto ?condensed/, "robotocondensed"],
  [/roboto ?mono/, "robotomono"],
  [/roboto/, "roboto"],
  [/^inter/, "inter"],
  [/open ?sans/, "opensans"],
  [/montserrat|gotham|futura|avenir|poppins/, "montserrat"],
  [/oswald/, "oswald"],
  [/bebas/, "bebas"],
  [/anton|impact|league ?gothic|haettenschweiler/, "anton"],
  [/condensed|narrow|compressed/, "robotocondensed"],
  [/merriweather/, "merriweather"],
  [/playfair|didot|bodoni/, "playfair"],
  [/lora/, "lora"],
  [/garamond|caslon|minion|palatino|antiqua/, "garamond"],
  [/courier ?prime/, "courierprime"],
  [/courier/, "courier"],
  [/mono|consol|menlo|typewriter/, "robotomono"],
  [/dancing|brush|lobster|pacifico|vibes/, "dancing"],
  [/allura|edwardian|vivaldi|alex|script/, "allura"],
  [/sacramento/, "sacramento"],
  [/indie|flower|marker|chalk/, "indieflower"],
  [/patrick|comic|hand|kalam|caveat/, "patrickhand"],
  [/times|georgia|cambria|baskerville|book|roman/, "times"],
  [/arial|helvet|calibri|verdana|segoe|tahoma|sans/, "helvetica"],
];

/** Picks the closest font for an embedded PDF font, from its name and
 *  descriptor flags (fixed-pitch / serif / script bits). */
export function matchFont(baseName: string, flags = 0): FontKey {
  const name = baseName.replace(/^[A-Z]{6}\+/, "").toLowerCase();
  for (const [re, key] of MATCHERS) if (re.test(name)) return key;
  if (/serif/.test(name) && !/sans/.test(name)) return "times";
  if (flags & 1) return "courier"; // FixedPitch
  if (flags & 8) return "dancing"; // Script
  if (flags & 2) return "times"; // Serif
  return "helvetica";
}

/** The built-in PDF font closest to a font (for approximate metrics). */
export function standardFallback(key: FontKey): "helvetica" | "times" | "courier" {
  const g = FONTS[key].generic;
  return g === "serif" ? "times" : g === "monospace" ? "courier" : "helvetica";
}

/** Standard PDF font name for a built-in family plus bold / italic. */
export function pdfFontName(key: FontKey, bold = false, italic = false) {
  const family = FONTS[key].standard ? key : standardFallback(key);
  if (family === "times") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  const base = family === "courier" ? "Courier" : "Helvetica";
  return `${base}${bold && italic ? "-BoldOblique" : bold ? "-Bold" : italic ? "-Oblique" : ""}`;
}

/* ------------------------- runtime (browser) ------------------------- */

/** CSS families of the bundled fonts (full and name-only preview),
 *  handed over from next/font. */
let families: Partial<Record<FontKey, string>> = {};
let previews: Partial<Record<FontKey, string>> = {};

export function setFontFamilies(
  full: Partial<Record<FontKey, string>>,
  preview: Partial<Record<FontKey, string>>
) {
  families = full;
  previews = preview;
}

export function fontCss(key: FontKey) {
  const def = FONTS[key];
  if (def.standard) return def.standard.css;
  return `${families[key] ?? `"${def.label}"`}, ${def.generic}`;
}

/** For showing a font's own name (font picker) — a tiny file with just
 *  those letters, so browsing fonts doesn't download them all. */
export function previewCss(key: FontKey) {
  const def = FONTS[key];
  if (def.standard) return def.standard.css;
  return `${previews[key] ?? families[key] ?? `"${def.label}"`}, ${def.generic}`;
}

/** Weight actually used — fonts without a bold stay regular, so the
 *  screen never shows a fake bold the PDF can't reproduce. */
export function fontWeight(key: FontKey, bold?: boolean) {
  return bold && FONTS[key].bold ? 700 : 400;
}

/** Download a bundled font (if needed) so it can be shown and measured. */
export async function ensureFont(key: FontKey, bold?: boolean) {
  if (FONTS[key].standard) return;
  try {
    await document.fonts.load(`${fontWeight(key, bold)} 100px ${fontCss(key)}`);
  } catch {
    // Falls back to the generic family on screen
  }
}

const baselines = new Map<string, number>();

/** Baseline offset from the top of a text box (fraction of font size) —
 *  measured from the loaded font the same way CSS lays out a line. */
export async function fontBaseline(key: FontKey, bold?: boolean): Promise<number> {
  const def = FONTS[key];
  if (def.standard) return def.standard.baseline;
  const weight = fontWeight(key, bold);
  const cacheKey = `${key}:${weight}`;
  const hit = baselines.get(cacheKey);
  if (hit !== undefined) return hit;

  await ensureFont(key, bold);
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `${weight} 100px ${fontCss(key)}`;
  const m = ctx.measureText("Hg");
  const asc = m.fontBoundingBoxAscent / 100;
  const desc = m.fontBoundingBoxDescent / 100;
  const baseline = Number.isFinite(asc) && Number.isFinite(desc) ? (LINE_HEIGHT - (asc + desc)) / 2 + asc : 0.95;
  baselines.set(cacheKey, baseline);
  return baseline;
}

const files = new Map<string, Promise<Uint8Array>>();

/** The TrueType file behind a bundled font, for embedding in the PDF.
 *  Found through next/font's @font-face rule, so it's the same (usually
 *  already cached) file the browser uses on screen. */
export function fontFile(key: FontKey, bold?: boolean): Promise<Uint8Array> {
  const weight = String(fontWeight(key, bold));
  const cacheKey = `${key}:${weight}`;
  let hit = files.get(cacheKey);
  if (!hit) {
    hit = (async () => {
      const family = families[key]?.match(/^\s*['"]?([^'",]+)/)?.[1]?.trim();
      const url = family && findFontUrl(family, weight);
      if (!url) throw new Error(`Font file for ${FONTS[key].label} not found`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Couldn't download ${FONTS[key].label}`);
      return new Uint8Array(await res.arrayBuffer());
    })();
    hit.catch(() => files.delete(cacheKey)); // allow a retry
    files.set(cacheKey, hit);
  }
  return hit;
}

function findFontUrl(family: string, weight: string): string | null {
  // `base`: the stylesheet's own address — next/font writes font URLs
  // relative to the CSS file (e.g. ../media/x.ttf), not to the page
  const walk = (rules: CSSRuleList, base: string): string | null => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const fam = rule.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
        const w = rule.style.getPropertyValue("font-weight").trim() || "400";
        if (fam === family && w === weight) {
          const src = rule.style.getPropertyValue("src").match(/url\(\s*['"]?([^'")]+)/)?.[1];
          if (src) return new URL(src, base).href;
        }
      } else if ("cssRules" in rule) {
        const nested = walk((rule as CSSGroupingRule).cssRules, base);
        if (nested) return nested;
      }
    }
    return null;
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const found = walk(sheet.cssRules, sheet.href ?? document.baseURI);
      if (found) return found;
    } catch {
      // Cross-origin sheet — not ours
    }
  }
  return null;
}
