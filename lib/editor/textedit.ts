import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRef,
  type PDFContext,
  type PDFObject,
  type PDFPageLeaf,
} from "pdf-lib";
import { hexString, num, parseContent, spliceContent, type Operand } from "./content";
import { getFontInfo, streamBytes, type FontInfo } from "./pdffont";
import type { FontKey, RunTarget } from "./types";

/* ------------------------------------------------------------------ */
/* Finds and removes existing text by rewriting the page's drawing     */
/* commands — so whatever is behind the text (patterns, photos,       */
/* gradients) shows through untouched, and the old text is really     */
/* gone from the file.                                                */
/*                                                                    */
/* Each removed glyph is replaced by spacing of exactly its width, so */
/* the text after it on the same line doesn't move. When a font's     */
/* widths aren't known exactly, the glyphs are made invisible         */
/* instead (render mode 3) — still no visible change to the layout.   */
/* ------------------------------------------------------------------ */

type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];

/** Style of the first glyph found for a target — used to match the
 *  replacement text to the original. */
export interface FoundStyle {
  color: string;
  family: FontKey;
  bold: boolean;
  italic: boolean;
}

export interface TextEditResult {
  counts: number[]; // glyphs found per target
  styles: (FoundStyle | null)[];
}

interface GState {
  ctm: M;
  fill: string;
  font: FontInfo | null;
  size: number;
  tc: number;
  tw: number;
  th: number;
  tl: number;
  rise: number;
  tr: number;
}

/** Nested forms deeper than this are left alone. */
const MAX_DEPTH = 8;

/**
 * Looks for glyphs inside each target on a page.
 *  - "analyze": only reports counts and styles (nothing is changed)
 *  - "remove": also rewrites the page (and any forms it uses) without them
 */
export function editPageText(
  context: PDFContext,
  page: PDFPageLeaf,
  targets: RunTarget[],
  mode: "analyze" | "remove"
): TextEditResult {
  const result: TextEditResult = {
    counts: targets.map(() => 0),
    styles: targets.map(() => null),
  };
  const look = (o: PDFObject | undefined) => (o instanceof PDFRef ? context.lookup(o) : o);

  // The page's content may be split over several streams — join them
  const contents = look(page.get(PDFName.of("Contents")));
  const streams = contents instanceof PDFArray ? contents.asArray().map(look) : [contents];
  const chunks = streams.map((s) => streamBytes(s ?? null)).filter((b): b is Uint8Array => !!b);
  const bytes = joinWithNewlines(chunks);
  // Resources may be inherited from a parent Pages node
  const resources = look(page.getInheritableAttribute(PDFName.of("Resources")));
  const res = resources instanceof PDFDict ? resources : undefined;

  const out = interpret(bytes, res, initialState(IDENTITY), 0);
  if (mode === "remove" && (out.edits.length || out.resources)) {
    const newBytes = spliceContent(bytes, out.edits);
    page.set(PDFName.of("Contents"), context.register(context.flateStream(newBytes)));
    if (out.resources) page.set(PDFName.of("Resources"), out.resources);
  }
  return result;

  /* ---------------------------------------------------------------- */

  function interpret(
    data: Uint8Array,
    resources: PDFDict | undefined,
    start: GState,
    depth: number
  ): { edits: { start: number; end: number; text: string }[]; resources?: PDFDict } {
    const ops = parseContent(data);
    const edits: { start: number; end: number; text: string }[] = [];
    let ownResources: PDFDict | undefined; // cloned lazily before any change
    let gs: GState = { ...start };
    const stack: GState[] = [];
    let tm: M = IDENTITY;
    let tlm: M = IDENTITY;

    const fontDict = look(resources?.get(PDFName.of("Font")));
    const xobjDict = look(resources?.get(PDFName.of("XObject")));

    for (const op of ops) {
      const a = op.args;
      switch (op.op) {
        case "q":
          stack.push({ ...gs });
          break;
        case "Q":
          gs = stack.pop() ?? gs;
          break;
        case "cm":
          if (a.length === 6) gs.ctm = mul(nums(a) as M, gs.ctm);
          break;
        case "BT":
          tm = tlm = IDENTITY;
          break;
        case "Tf": {
          const name = a[0]?.t === "name" ? a[0].v : null;
          const dict = name && fontDict instanceof PDFDict ? look(fontDict.get(PDFName.of(name))) : null;
          gs.font = dict instanceof PDFDict ? getFontInfo(context, dict) : null;
          gs.size = numAt(a, 1);
          break;
        }
        case "Tc":
          gs.tc = numAt(a, 0);
          break;
        case "Tw":
          gs.tw = numAt(a, 0);
          break;
        case "Tz":
          gs.th = numAt(a, 0) / 100;
          break;
        case "TL":
          gs.tl = numAt(a, 0);
          break;
        case "Ts":
          gs.rise = numAt(a, 0);
          break;
        case "Tr":
          gs.tr = numAt(a, 0);
          break;
        case "Td":
          tlm = mul([1, 0, 0, 1, numAt(a, 0), numAt(a, 1)], tlm);
          tm = tlm;
          break;
        case "TD":
          gs.tl = -numAt(a, 1);
          tlm = mul([1, 0, 0, 1, numAt(a, 0), numAt(a, 1)], tlm);
          tm = tlm;
          break;
        case "Tm":
          if (a.length === 6) tm = tlm = nums(a) as M;
          break;
        case "T*":
          tlm = mul([1, 0, 0, 1, 0, -gs.tl], tlm);
          tm = tlm;
          break;
        case "Tj":
        case "TJ":
        case "'":
        case '"': {
          let prefix = "";
          if (op.op === "'" || op.op === '"') {
            if (op.op === '"') {
              gs.tw = numAt(a, 0);
              gs.tc = numAt(a, 1);
              prefix = `${num(gs.tw)} Tw ${num(gs.tc)} Tc `;
            }
            tlm = mul([1, 0, 0, 1, 0, -gs.tl], tlm);
            tm = tlm;
            prefix += "T* ";
          }
          const shown = a[a.length - 1];
          const elements: Operand[] = op.op === "TJ" && shown?.t === "arr" ? shown.v : shown ? [shown] : [];
          const rewrite = showText(elements);
          if (rewrite !== null && mode === "remove") {
            edits.push({ start: op.start, end: op.end, text: prefix + rewrite });
          }
          break;
        }
        case "g":
          gs.fill = grayHex(numAt(a, 0));
          break;
        case "rg":
          gs.fill = rgbHex(numAt(a, 0), numAt(a, 1), numAt(a, 2));
          break;
        case "k":
          gs.fill = cmykHex(numAt(a, 0), numAt(a, 1), numAt(a, 2), numAt(a, 3));
          break;
        case "cs":
          gs.fill = "#000000"; // a new colour space starts at its default
          break;
        case "sc":
        case "scn": {
          const v = a.filter((x) => x.t === "num").map((x) => (x as { v: number }).v);
          if (v.length === 1) gs.fill = grayHex(v[0]);
          else if (v.length === 3) gs.fill = rgbHex(v[0], v[1], v[2]);
          else if (v.length === 4) gs.fill = cmykHex(v[0], v[1], v[2], v[3]);
          break;
        }
        case "Do": {
          if (depth >= MAX_DEPTH || a[0]?.t !== "name" || !(xobjDict instanceof PDFDict)) break;
          const name = a[0].v;
          const ref = xobjDict.get(PDFName.of(name));
          const form = look(ref);
          const dict = (form as { dict?: PDFDict } | undefined)?.dict;
          if (!dict || look(dict.get(PDFName.of("Subtype")))?.toString() !== "/Form") break;
          const formBytes = streamBytes(form ?? null);
          if (!formBytes) break;

          const matrix = look(dict.get(PDFName.of("Matrix")));
          const fm: M =
            matrix instanceof PDFArray
              ? (matrix.asArray().map((x) => (look(x) as PDFNumber)?.asNumber?.() ?? 0) as M)
              : IDENTITY;
          const formRes = look(dict.get(PDFName.of("Resources")));
          const child = interpret(
            formBytes,
            formRes instanceof PDFDict ? formRes : resources, // forms may inherit
            { ...gs, ctm: mul(fm, gs.ctm) },
            depth + 1
          );
          if (mode !== "remove" || (!child.edits.length && !child.resources)) break;

          // Copy-on-write: the form may be shared with other pages, so the
          // edited version becomes a new form under a new name here only
          const newForm = context.flateStream(spliceContent(formBytes, child.edits));
          for (const [key, value] of dict.entries()) {
            const k = key.asString();
            if (k !== "/Filter" && k !== "/DecodeParms" && k !== "/Length") newForm.dict.set(key, value);
          }
          if (child.resources) newForm.dict.set(PDFName.of("Resources"), child.resources);
          const newName = addXObject(context.register(newForm));
          edits.push({ start: op.start, end: op.end, text: `/${newName} Do` });
          break;
        }
      }
    }
    return { edits, resources: ownResources };

    /** Adds an XObject to this level's (cloned) resources; returns its name. */
    function addXObject(ref: PDFRef) {
      if (!ownResources) {
        ownResources = resources ? resources.clone(context) : context.obj({});
        const xo = look(ownResources.get(PDFName.of("XObject")));
        ownResources.set(
          PDFName.of("XObject"),
          xo instanceof PDFDict ? xo.clone(context) : context.obj({})
        );
      }
      const xo = ownResources.get(PDFName.of("XObject")) as PDFDict;
      let n = 1;
      while (xo.has(PDFName.of(`PDEdit${n}`))) n++;
      xo.set(PDFName.of(`PDEdit${n}`), ref);
      return `PDEdit${n}`;
    }

    /** Walks the glyphs of one text-showing operator, advancing the text
     *  matrix. Returns replacement operator text if any glyph is removed. */
    function showText(elements: Operand[]): string | null {
      const font = gs.font;
      if (!font || gs.size === 0) {
        // Can't place glyphs without a font — just skip over TJ numbers
        return null;
      }
      const trm = () => mul(tm, gs.ctm);
      // adv = how far a removed glyph moved the pen (before horizontal scaling)
      type Piece = { t: "str"; bytes: Uint8Array; hidden: boolean; adv: number } | { t: "num"; v: number };
      const pieces: Piece[] = [];
      let removedAny = false;
      let exact = font.exact;

      for (const el of elements) {
        if (el.t === "num") {
          tm = mul([1, 0, 0, 1, (-el.v / 1000) * gs.size * gs.th, 0], tm);
          pieces.push({ t: "num", v: el.v });
          continue;
        }
        if (el.t !== "str") continue;
        let offset = 0;
        for (const { code, len } of font.split(el.bytes)) {
          const w0 = font.width(code);
          if (w0 === null) exact = false;
          const w = w0 ?? 0.5;
          const isSpace = len === 1 && code === 32;
          const adv = (w * gs.size + gs.tc + (isSpace ? gs.tw : 0)) * gs.th;

          // Glyph centre: half its width along, a third of an em up
          let hit = -1;
          if (!font.vertical && gs.tr !== 3) {
            const [cx, cy] = apply(trm(), (w * gs.size * gs.th) / 2, gs.size * 0.3 + gs.rise);
            hit = targets.findIndex((t) => inside(t, cx, cy));
          }
          const glyphBytes = el.bytes.subarray(offset, offset + len);
          if (hit >= 0) {
            result.counts[hit]++;
            result.styles[hit] ??= { color: gs.fill, family: font.family, bold: font.bold, italic: font.italic };
            removedAny = true;
            // Spacing that moves the pen exactly as far as the glyph did
            pieces.push({ t: "str", bytes: glyphBytes, hidden: true, adv: adv / gs.th });
          } else {
            const last = pieces[pieces.length - 1];
            if (last?.t === "str" && !last.hidden) last.bytes = concat(last.bytes, glyphBytes);
            else pieces.push({ t: "str", bytes: glyphBytes, hidden: false, adv: 0 });
          }
          tm = mul([1, 0, 0, 1, adv, 0], tm);
          offset += len;
        }
      }
      if (!removedAny) return null;

      if (exact) {
        // Hidden glyphs become TJ spacing numbers: -1000 · advance / size
        const arr = pieces.map((p) => {
          if (p.t === "num") return num(p.v);
          if (!p.hidden) return hexString(p.bytes);
          return num((-1000 * p.adv) / gs.size);
        });
        return `[${arr.join(" ")}] TJ`;
      }

      // Widths not certain: keep the glyphs (so spacing is untouched) but
      // switch them to invisible, then restore the render mode
      let text = "";
      let group: string[] = [];
      let hidden = false;
      const flush = () => {
        if (!group.length) return;
        text += hidden ? `3 Tr [${group.join(" ")}] TJ ${num(gs.tr)} Tr ` : `[${group.join(" ")}] TJ `;
        group = [];
      };
      for (const p of pieces) {
        const h = p.t === "str" && p.hidden;
        if (p.t === "str" && h !== hidden) {
          flush();
          hidden = h;
        }
        group.push(p.t === "num" ? num(p.v) : hexString(p.bytes));
      }
      flush();
      return text.trim();
    }
  }
}

/* ------------------------------ helpers ------------------------------ */

function initialState(ctm: M): GState {
  return {
    ctm,
    fill: "#000000",
    font: null,
    size: 0,
    tc: 0,
    tw: 0,
    th: 1,
    tl: 0,
    rise: 0,
    tr: 0,
  };
}

/** Is a point (user space) inside a target's box? A little slack around
 *  it so glyph centres just past the edges still count. */
function inside(t: RunTarget, x: number, y: number) {
  const dx = x - t.ox;
  const dy = y - t.oy;
  const s = dx * t.ux + dy * t.uy; // along the baseline
  const v = dx * t.vx + dy * t.vy; // up from the baseline
  const em = t.asc - t.desc;
  return s >= -0.1 * em && s <= t.width + 0.1 * em && v >= t.desc - 0.05 * em && v <= t.asc + 0.05 * em;
}

/** Matrix product A × B (apply A, then B) in PDF's row-vector convention. */
function mul(A: M, B: M): M {
  return [
    A[0] * B[0] + A[1] * B[2],
    A[0] * B[1] + A[1] * B[3],
    A[2] * B[0] + A[3] * B[2],
    A[2] * B[1] + A[3] * B[3],
    A[4] * B[0] + A[5] * B[2] + B[4],
    A[4] * B[1] + A[5] * B[3] + B[5],
  ];
}

function apply(m: M, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function nums(a: Operand[]) {
  return a.map((x) => (x.t === "num" ? x.v : 0));
}

function numAt(a: Operand[], i: number) {
  const x = a[i];
  return x?.t === "num" ? x.v : 0;
}

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function joinWithNewlines(chunks: Uint8Array[]) {
  const total = chunks.reduce((s, c) => s + c.length + 1, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
    out[o++] = 10;
  }
  return out;
}

const hex2 = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0");
const grayHex = (g: number) => `#${hex2(g)}${hex2(g)}${hex2(g)}`;
const rgbHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const cmykHex = (c: number, m: number, y: number, k: number) =>
  rgbHex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));

