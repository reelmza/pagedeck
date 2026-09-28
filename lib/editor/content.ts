/* ------------------------------------------------------------------ */
/* Minimal PDF content-stream tokenizer.                              */
/*                                                                    */
/* Splits a page's drawing commands into operators with their        */
/* operands and byte offsets, so individual operators can be          */
/* rewritten while every other byte is kept exactly as it was.        */
/* ------------------------------------------------------------------ */

export type Operand =
  | { t: "num"; v: number }
  | { t: "name"; v: string }
  | { t: "str"; bytes: Uint8Array }
  | { t: "arr"; v: Operand[] }
  | { t: "other" }; // dicts, booleans, null — never needed for text

export interface Op {
  op: string;
  args: Operand[];
  start: number; // offset of the first operand (or the operator)
  end: number; // offset just past the operator
}

const isWhite = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelim = (c: number) =>
  c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d ||
  c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;
const isRegular = (c: number) => !isWhite(c) && !isDelim(c);

export function parseContent(data: Uint8Array): Op[] {
  const ops: Op[] = [];
  const n = data.length;
  let args: Operand[] = [];
  let argStart = -1;
  const arrays: Operand[][] = []; // open [ … ] arrays
  let i = 0;

  const push = (operand: Operand, at: number) => {
    if (arrays.length) arrays[arrays.length - 1].push(operand);
    else {
      if (argStart < 0) argStart = at;
      args.push(operand);
    }
  };

  while (i < n) {
    const c = data[i];
    if (isWhite(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      // % comment to end of line
      while (i < n && data[i] !== 10 && data[i] !== 13) i++;
      continue;
    }
    const at = i;

    if (c === 0x28) {
      const [bytes, next] = readLiteral(data, i);
      push({ t: "str", bytes }, at);
      i = next;
    } else if (c === 0x3c) {
      if (data[i + 1] === 0x3c) {
        i = skipDict(data, i);
        push({ t: "other" }, at);
      } else {
        const [bytes, next] = readHex(data, i);
        push({ t: "str", bytes }, at);
        i = next;
      }
    } else if (c === 0x5b) {
      if (!arrays.length && argStart < 0) argStart = at;
      arrays.push([]);
      i++;
    } else if (c === 0x5d) {
      const arr = arrays.pop() ?? [];
      i++;
      push({ t: "arr", v: arr }, at);
    } else if (c === 0x2f) {
      i++;
      const s = i;
      while (i < n && isRegular(data[i])) i++;
      push({ t: "name", v: latin1(data, s, i) }, at);
    } else if (isDelim(c)) {
      i++; // stray ) > { } — skip
    } else {
      while (i < n && isRegular(data[i])) i++;
      const word = latin1(data, at, i);
      const num = Number(word);
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) && Number.isFinite(num)) {
        push({ t: "num", v: num }, at);
      } else if (word === "true" || word === "false" || word === "null") {
        push({ t: "other" }, at);
      } else if (arrays.length) {
        // Operator inside an array — malformed; ignore it
      } else {
        if (word === "BI") i = skipInlineImage(data, i);
        ops.push({ op: word, args, start: argStart >= 0 ? argStart : at, end: i });
        args = [];
        argStart = -1;
      }
    }
  }
  return ops;
}

/** Applies byte-range replacements (non-overlapping) to the stream. */
export function spliceContent(
  data: Uint8Array,
  edits: { start: number; end: number; text: string }[]
): Uint8Array {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  const parts: Uint8Array[] = [];
  let pos = 0;
  for (const e of sorted) {
    parts.push(data.subarray(pos, e.start), latin1Bytes(e.text));
    pos = e.end;
  }
  parts.push(data.subarray(pos));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** A PDF string as a hex literal — always safe to write back. */
export function hexString(bytes: Uint8Array) {
  let s = "<";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s + ">";
}

/** Compact number formatting for rewritten operators. */
export function num(v: number) {
  return (Math.round(v * 1000) / 1000).toString();
}

/* ------------------------------ lexing ------------------------------ */

function readLiteral(d: Uint8Array, i: number): [Uint8Array, number] {
  const out: number[] = [];
  let depth = 1;
  i++; // past (
  while (i < d.length && depth > 0) {
    const c = d[i++];
    if (c === 0x5c) {
      // backslash escape
      const e = d[i++];
      if (e === 0x6e) out.push(10);
      else if (e === 0x72) out.push(13);
      else if (e === 0x74) out.push(9);
      else if (e === 0x62) out.push(8);
      else if (e === 0x66) out.push(12);
      else if (e === 0x0d) {
        if (d[i] === 0x0a) i++; // line continuation
      } else if (e === 0x0a) {
        // line continuation
      } else if (e >= 0x30 && e <= 0x37) {
        let v = e - 0x30;
        for (let k = 0; k < 2 && d[i] >= 0x30 && d[i] <= 0x37; k++) v = v * 8 + (d[i++] - 0x30);
        out.push(v & 0xff);
      } else out.push(e);
    } else if (c === 0x28) {
      depth++;
      out.push(c);
    } else if (c === 0x29) {
      depth--;
      if (depth > 0) out.push(c);
    } else out.push(c);
  }
  return [Uint8Array.from(out), i];
}

function readHex(d: Uint8Array, i: number): [Uint8Array, number] {
  const out: number[] = [];
  let hi = -1;
  i++; // past <
  while (i < d.length && d[i] !== 0x3e) {
    const v = hexVal(d[i++]);
    if (v < 0) continue;
    if (hi < 0) hi = v;
    else {
      out.push(hi * 16 + v);
      hi = -1;
    }
  }
  if (hi >= 0) out.push(hi * 16);
  return [Uint8Array.from(out), i + 1];
}

function hexVal(c: number) {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x41 && c <= 0x46) return c - 0x37;
  if (c >= 0x61 && c <= 0x66) return c - 0x57;
  return -1;
}

function skipDict(d: Uint8Array, i: number) {
  let depth = 0;
  while (i < d.length) {
    const c = d[i];
    if (c === 0x3c && d[i + 1] === 0x3c) {
      depth++;
      i += 2;
    } else if (c === 0x3e && d[i + 1] === 0x3e) {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else if (c === 0x28) i = readLiteral(d, i)[1];
    else if (c === 0x3c) i = readHex(d, i)[1];
    else i++;
  }
  return i;
}

/** Skips an inline image's dictionary and binary data (… ID <data> EI). */
function skipInlineImage(d: Uint8Array, i: number) {
  // Find the ID keyword
  while (i < d.length - 1) {
    if (d[i] === 0x49 && d[i + 1] === 0x44 && isWhite(d[i - 1]) && (i + 2 >= d.length || isWhite(d[i + 2]))) {
      i += 3;
      break;
    }
    i++;
  }
  // Then the EI that ends the binary data
  while (i < d.length - 1) {
    if (d[i] === 0x45 && d[i + 1] === 0x49 && isWhite(d[i - 1]) && (i + 2 >= d.length || isWhite(d[i + 2]))) {
      return i + 2;
    }
    i++;
  }
  return d.length;
}

function latin1(d: Uint8Array, s: number, e: number) {
  let out = "";
  for (let k = s; k < e; k++) out += String.fromCharCode(d[k]);
  return out;
}

function latin1Bytes(s: string) {
  const out = new Uint8Array(s.length);
  for (let k = 0; k < s.length; k++) out[k] = s.charCodeAt(k) & 0xff;
  return out;
}
