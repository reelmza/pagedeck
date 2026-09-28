import {
  decodePDFRawStream,
  PDFArray,
  PDFContentStream,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFContext,
  type PDFObject,
} from "pdf-lib";
import { Encodings, Font as StandardFont } from "@pdf-lib/standard-fonts";
import { matchFont, pdfFontName, standardFallback } from "./fonts";
import type { FontKey } from "./types";

/** What the text interpreter needs to know about a font. */
export interface FontInfo {
  /** Split a shown string into character codes (1 or more bytes each). */
  split: (bytes: Uint8Array) => { code: number; len: number }[];
  /** Advance width in text space per unit font size, or null if unknown. */
  width: (code: number) => number | null;
  /** True when widths come straight from the file (so removed glyphs can
   *  be replaced by spacing of exactly the same width). */
  exact: boolean;
  vertical: boolean;
  /** Best guess at a matching standard font, for replacement text. */
  family: FontKey;
  bold: boolean;
  italic: boolean;
}

const STANDARD_14 = [
  "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
  "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
  "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
] as const;

const cache = new WeakMap<PDFDict, FontInfo>();

export function getFontInfo(context: PDFContext, dict: PDFDict): FontInfo {
  const hit = cache.get(dict);
  if (hit) return hit;
  const info = build(context, dict);
  cache.set(dict, info);
  return info;
}

function build(context: PDFContext, dict: PDFDict): FontInfo {
  const look = <T extends PDFObject>(o: PDFObject | undefined) =>
    (o instanceof PDFRef ? context.lookup(o) : o) as T | undefined;

  const subtype = look<PDFName>(dict.get(PDFName.of("Subtype")))?.asString();
  const baseName = (look<PDFName>(dict.get(PDFName.of("BaseFont")))?.asString() ?? "/").slice(1);
  const descendant =
    subtype === "/Type0"
      ? look<PDFDict>(look<PDFArray>(dict.get(PDFName.of("DescendantFonts")))?.get(0))
      : undefined;
  const descriptor = look<PDFDict>((descendant ?? dict).get(PDFName.of("FontDescriptor")));
  const flags = look<PDFNumber>(descriptor?.get(PDFName.of("Flags")))?.asNumber() ?? 0;
  const style = guessStyle(baseName, flags);

  if (subtype === "/Type0") {
    const encoding = look<PDFObject>(dict.get(PDFName.of("Encoding")));
    const cmap = encoding instanceof PDFName ? null : parseCMap(streamBytes(encoding));
    const encName = encoding instanceof PDFName ? encoding.asString() : "";
    const identity = /Identity|UCS2|UTF16/.test(encName);
    const widths = cidWidths(context, descendant);

    return {
      ...style,
      vertical: /-V$/.test(encName),
      // Identity (by far the most common) maps codes 1:1 to CIDs;
      // embedded CMaps are parsed; other named CMaps are guessed
      exact: identity || (!!cmap && cmap.complete),
      split: (bytes) => (cmap ? cmap.split(bytes) : splitFixed(bytes, 2)),
      width: (code) => widths(cmap ? cmap.cid(code) : code),
    };
  }

  // Simple fonts (Type1, TrueType, Type3)
  const firstChar = look<PDFNumber>(dict.get(PDFName.of("FirstChar")))?.asNumber() ?? 0;
  const widthsArr = look<PDFArray>(dict.get(PDFName.of("Widths")));
  const missing = look<PDFNumber>(descriptor?.get(PDFName.of("MissingWidth")))?.asNumber();
  // Type3 glyph units come from its FontMatrix; everything else is 1/1000
  const fontMatrix = look<PDFArray>(dict.get(PDFName.of("FontMatrix")));
  const unit = fontMatrix ? (look<PDFNumber>(fontMatrix.get(0))?.asNumber() ?? 0.001) : 0.001;

  if (widthsArr) {
    const widths = widthsArr.asArray().map((w) => look<PDFNumber>(w)?.asNumber() ?? 0);
    return {
      ...style,
      vertical: false,
      exact: true,
      split: (bytes) => splitFixed(bytes, 1),
      width: (code) => {
        const w = widths[code - firstChar];
        return (w ?? missing ?? null) === null ? null : (w ?? missing!) * unit;
      },
    };
  }

  // No Widths: one of the standard 14 fonts — use its built-in metrics
  const std =
    STANDARD_14.find((n) => n === baseName) ??
    (pdfFontName(standardFallback(style.family), style.bold, style.italic) as (typeof STANDARD_14)[number]);
  const metrics = StandardFont.load(std);
  const decoder = new TextDecoder("windows-1252");
  const encoding = look<PDFObject>(dict.get(PDFName.of("Encoding")));
  return {
    ...style,
    vertical: false,
    // Exact only for a genuine standard font in WinAnsi (the metrics we
    // use); anything else is an approximation
    exact:
      STANDARD_14.some((n) => n === baseName) &&
      encoding instanceof PDFName &&
      encoding.asString() === "/WinAnsiEncoding",
    split: (bytes) => splitFixed(bytes, 1),
    width: (code) => {
      const ch = decoder.decode(Uint8Array.of(code)).codePointAt(0) ?? 32;
      const name = Encodings.WinAnsi.canEncodeUnicodeCodePoint(ch)
        ? Encodings.WinAnsi.encodeUnicodeCodePoint(ch).name
        : "space";
      const w = metrics.getWidthOfGlyph(name);
      return (typeof w === "number" ? w : 500) / 1000;
    },
  };
}

/* ------------------------------ styles ------------------------------ */

/** Family / bold / italic from the font's name and descriptor flags. */
function guessStyle(baseName: string, flags: number) {
  const name = baseName.replace(/^[A-Z]{6}\+/, "").toLowerCase();
  const bold = /bold|black|heavy|semibold|demi/.test(name) || (flags & (1 << 18)) !== 0;
  const italic = /italic|oblique/.test(name) || (flags & (1 << 6)) !== 0;
  return { family: matchFont(baseName, flags), bold, italic };
}

/* --------------------------- CID fonts ------------------------------ */

/** Width lookup for a CIDFont from its /W array and /DW default. */
function cidWidths(context: PDFContext, font: PDFDict | undefined) {
  const look = (o: PDFObject | undefined) => (o instanceof PDFRef ? context.lookup(o) : o);
  const dwObj = look(font?.get(PDFName.of("DW")));
  const dw = dwObj instanceof PDFNumber ? dwObj.asNumber() : 1000;
  const map = new Map<number, number>();
  const ranges: [number, number, number][] = [];
  const w = look(font?.get(PDFName.of("W")));
  if (w instanceof PDFArray) {
    const items = w.asArray().map(look);
    for (let i = 0; i < items.length; ) {
      const first = (items[i] as PDFNumber).asNumber?.();
      const next = items[i + 1];
      if (first === undefined) break;
      if (next instanceof PDFArray) {
        next.asArray().forEach((v, k) => map.set(first + k, (look(v) as PDFNumber).asNumber()));
        i += 2;
      } else {
        const last = (next as PDFNumber)?.asNumber?.();
        const width = (items[i + 2] as PDFNumber)?.asNumber?.();
        if (last === undefined || width === undefined) break;
        ranges.push([first, last, width]);
        i += 3;
      }
    }
  }
  return (cid: number) => {
    const direct = map.get(cid);
    if (direct !== undefined) return direct / 1000;
    for (const [a, b, width] of ranges) if (cid >= a && cid <= b) return width / 1000;
    return dw / 1000;
  };
}

/** Parses the parts of an embedded CMap we need: how many bytes each code
 *  uses (codespace ranges) and which CID each code maps to. */
function parseCMap(bytes: Uint8Array | null) {
  if (!bytes) return null;
  const text = new TextDecoder("latin1").decode(bytes);
  const hex = (s: string) => parseInt(s, 16);

  const spaces: { len: number; lo: number; hi: number }[] = [];
  for (const block of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
    for (const [, lo, hi] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      spaces.push({ len: lo.length / 2, lo: hex(lo), hi: hex(hi) });
    }
  }
  const cids = new Map<number, number>();
  const cidRanges: [number, number, number][] = [];
  for (const block of text.matchAll(/begincidrange([\s\S]*?)endcidrange/g)) {
    for (const [, lo, hi, cid] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\d+)/g)) {
      cidRanges.push([hex(lo), hex(hi), Number(cid)]);
    }
  }
  for (const block of text.matchAll(/begincidchar([\s\S]*?)endcidchar/g)) {
    for (const [, code, cid] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*(\d+)/g)) cids.set(hex(code), Number(cid));
  }
  const lens = [...new Set(spaces.map((s) => s.len))].sort((a, b) => a - b);

  return {
    complete: spaces.length > 0,
    split: (b: Uint8Array) => {
      if (!spaces.length) return splitFixed(b, 2);
      const out: { code: number; len: number }[] = [];
      for (let i = 0; i < b.length; ) {
        let matched = 0;
        let code = 0;
        for (const len of lens) {
          if (i + len > b.length) break;
          let v = 0;
          for (let k = 0; k < len; k++) v = v * 256 + b[i + k];
          if (spaces.some((s) => s.len === len && v >= s.lo && v <= s.hi)) {
            matched = len;
            code = v;
            break;
          }
        }
        if (!matched) {
          matched = 1;
          code = b[i];
        }
        out.push({ code, len: matched });
        i += matched;
      }
      return out;
    },
    cid: (code: number) => {
      const direct = cids.get(code);
      if (direct !== undefined) return direct;
      for (const [lo, hi, start] of cidRanges) if (code >= lo && code <= hi) return start + code - lo;
      return code;
    },
  };
}

function splitFixed(bytes: Uint8Array, len: number) {
  const out: { code: number; len: number }[] = [];
  for (let i = 0; i + len <= bytes.length; i += len) {
    out.push({ code: len === 1 ? bytes[i] : bytes[i] * 256 + bytes[i + 1], len });
  }
  return out;
}

/** Decoded bytes of any stream object pdf-lib may hand us. */
export function streamBytes(obj: PDFObject | undefined | null): Uint8Array | null {
  if (obj instanceof PDFRawStream) return decodePDFRawStream(obj).decode();
  if (obj instanceof PDFContentStream) return obj.getUnencodedContents();
  return null;
}
