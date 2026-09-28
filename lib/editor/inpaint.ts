/* ------------------------------------------------------------------ */
/* Content-aware fill (PatchMatch inpainting).                        */
/*                                                                    */
/* Fills a rectangular hole in an image by copying small patches from */
/* the area around it — the idea behind Photoshop's Content-Aware     */
/* Fill (Barnes et al. 2009, with Wexler-style voting). Works coarse  */
/* to fine: the hole is first filled at low resolution, where the     */
/* overall structure settles, then refined level by level.            */
/*                                                                    */
/* Plain maths on typed arrays — no DOM — so it runs in a web worker. */
/* ------------------------------------------------------------------ */

export interface Hole {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Patch radius — patches are (2R+1)² pixels. */
const R = 3;
/** Downscale until the hole is about this small (longest side). */
const COARSEST_HOLE = 12;
const MAX_LEVELS = 7;
/** Similarity weight falloff for voting (per-pixel colour distance). */
const SIGMA = 28;
/** Cost per squared pixel of distance between a spot and the patch it
 *  copies — prefers nearby patches, which keeps gradients and lighting
 *  consistent (far-away patches can match texture but not brightness). */
const LOCALITY = 2;

interface Level {
  w: number;
  h: number;
  img: Float32Array; // RGB, 3 per pixel
  hole: Uint8Array; // 1 = to fill
}

/** Returns a copy of `rgba` (width × height) with the hole filled. */
export function inpaint(rgba: Uint8ClampedArray, width: number, height: number, hole: Hole): Uint8ClampedArray {
  // Level 0 at full size
  const base: Level = { w: width, h: height, img: new Float32Array(width * height * 3), hole: new Uint8Array(width * height) };
  for (let i = 0; i < width * height; i++) {
    base.img[i * 3] = rgba[i * 4];
    base.img[i * 3 + 1] = rgba[i * 4 + 1];
    base.img[i * 3 + 2] = rgba[i * 4 + 2];
  }
  const hx0 = clampInt(hole.x, 0, width), hy0 = clampInt(hole.y, 0, height);
  const hx1 = clampInt(hole.x + hole.w, 0, width), hy1 = clampInt(hole.y + hole.h, 0, height);
  for (let y = hy0; y < hy1; y++) for (let x = hx0; x < hx1; x++) base.hole[y * width + x] = 1;

  // Pyramid, coarse levels at the end
  const levels: Level[] = [base];
  let holeSize = Math.max(hx1 - hx0, hy1 - hy0);
  while (levels.length < MAX_LEVELS && holeSize > COARSEST_HOLE) {
    const prev = levels[levels.length - 1];
    if (Math.min(prev.w, prev.h) < 4 * (2 * R + 1)) break;
    levels.push(downsample(prev));
    holeSize /= 2;
  }

  // Coarsest: start from a smooth fill, then refine every level
  let nnf: Int32Array | null = null;
  let prevLevel: Level | null = null;
  for (let li = levels.length - 1; li >= 0; li--) {
    const L = levels[li];
    const valid = validCentres(L);
    const targets = targetPixels(L);
    if (!prevLevel) diffuseFill(L);
    else upsampleFill(prevLevel, L);

    if (!valid.count) {
      // Too little surrounding texture to copy from: keep the smooth fill
      if (li === 0) break;
      prevLevel = L;
      nnf = null;
      continue;
    }

    nnf = nnf && prevLevel ? upsampleNnf(nnf, prevLevel, L, valid) : randomNnf(L, targets, valid);
    const dist = new Float32Array(L.w * L.h);
    const emRounds = li === levels.length - 1 ? 6 : li === 0 ? 2 : 3;
    for (let em = 0; em < emRounds; em++) {
      for (const t of targets) dist[t] = patchDistance(L, t, nnf[t], Infinity);
      patchMatch(L, targets, nnf, dist, valid, 4);
      // Averaging overlapping patches blurs fine grain, so the very last
      // pass copies each pixel straight from its best match instead
      if (li === 0 && em === emRounds - 1) copyCentres(L, nnf);
      else vote(L, targets, nnf, dist);
    }
    prevLevel = L;
  }

  correctLowFrequencies(levels, hx1 - hx0, hy1 - hy0);

  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < width * height; i++) {
    if (!base.hole[i]) continue;
    out[i * 4] = base.img[i * 3];
    out[i * 4 + 1] = base.img[i * 3 + 1];
    out[i * 4 + 2] = base.img[i * 3 + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/* ------------------------------ pyramid ------------------------------ */

function downsample(L: Level): Level {
  const w = Math.floor(L.w / 2), h = Math.floor(L.h / 2);
  const img = new Float32Array(w * h * 3);
  const hole = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x;
      let n = 0;
      let isHole = 0;
      const acc = [0, 0, 0];
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = (2 * y + dy) * L.w + (2 * x + dx);
          // Hole if any child is — so the coarse hole always covers it
          if (L.hole[i]) isHole = 1;
          else {
            acc[0] += L.img[i * 3];
            acc[1] += L.img[i * 3 + 1];
            acc[2] += L.img[i * 3 + 2];
            n++;
          }
        }
      }
      hole[o] = isHole;
      if (n) for (let c = 0; c < 3; c++) img[o * 3 + c] = acc[c] / n;
    }
  }
  return { w, h, img, hole };
}

/** First guess at the coarsest level: repeatedly average known
 *  neighbours inward from the hole's edge. */
function diffuseFill(L: Level) {
  const { w, h, img, hole } = L;
  const known = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) known[i] = hole[i] ? 0 : 1;
  let remaining = true;
  for (let pass = 0; pass < 2 * (w + h) && remaining; pass++) {
    remaining = false;
    const next = known.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        let n = 0;
        const acc = [0, 0, 0];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!known[j]) continue;
          for (let c = 0; c < 3; c++) acc[c] += img[j * 3 + c];
          n++;
        }
        if (n) {
          for (let c = 0; c < 3; c++) img[i * 3 + c] = acc[c] / n;
          next[i] = 1;
        } else remaining = true;
      }
    }
    known.set(next);
  }
}

/** Seed a finer level's hole from the coarser level's result. */
function upsampleFill(coarse: Level, fine: Level) {
  for (let y = 0; y < fine.h; y++) {
    for (let x = 0; x < fine.w; x++) {
      const i = y * fine.w + x;
      if (!fine.hole[i]) continue;
      const cx = Math.min(coarse.w - 1, x >> 1), cy = Math.min(coarse.h - 1, y >> 1);
      const j = cy * coarse.w + cx;
      for (let c = 0; c < 3; c++) fine.img[i * 3 + c] = coarse.img[j * 3 + c];
    }
  }
}

/* ------------------------------ patches ------------------------------ */

/** Patch centres that can be copied from: the whole patch is inside the
 *  image and outside the hole (via a summed-area table of the hole). */
function validCentres(L: Level) {
  const { w, h, hole } = L;
  const sat = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += hole[y * w + x];
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
    }
  }
  const ok = new Uint8Array(w * h);
  const list: number[] = [];
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      const x0 = x - R, y0 = y - R, x1 = x + R + 1, y1 = y + R + 1;
      const holes = sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      if (!holes) {
        ok[y * w + x] = 1;
        list.push(y * w + x);
      }
    }
  }
  return { ok, list, count: list.length };
}

/** Pixels whose patch touches the hole — these get a match each. */
function targetPixels(L: Level): number[] {
  const { w, h, hole } = L;
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let touches = false;
      for (let dy = -R; dy <= R && !touches; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && hole[yy * w + xx]) {
            touches = true;
            break;
          }
        }
      }
      if (touches) out.push(y * w + x);
    }
  }
  return out;
}

/** Sum of squared colour differences between the patch around t (current
 *  image, hole included) and the patch around s. Stops early past `cap`. */
function patchDistance(L: Level, t: number, s: number, cap: number) {
  const { w, h, img } = L;
  const tx = t % w, ty = (t / w) | 0;
  const sx = s % w, sy = (s / w) | 0;
  let d = LOCALITY * ((sx - tx) * (sx - tx) + (sy - ty) * (sy - ty));
  if (d > cap) return d;
  for (let dy = -R; dy <= R; dy++) {
    const ty2 = ty + dy;
    if (ty2 < 0 || ty2 >= h) continue;
    for (let dx = -R; dx <= R; dx++) {
      const tx2 = tx + dx;
      if (tx2 < 0 || tx2 >= w) continue;
      const a = (ty2 * w + tx2) * 3;
      const b = ((sy + dy) * w + sx + dx) * 3;
      const r = img[a] - img[b], g = img[a + 1] - img[b + 1], bl = img[a + 2] - img[b + 2];
      d += r * r + g * g + bl * bl;
      if (d > cap) return d;
    }
  }
  return d;
}

function randomNnf(L: Level, targets: number[], valid: { list: number[] }) {
  const nnf = new Int32Array(L.w * L.h);
  for (const t of targets) nnf[t] = valid.list[(Math.random() * valid.list.length) | 0];
  return nnf;
}

/** Carry matches up a level: same relative offset, doubled. */
function upsampleNnf(prev: Int32Array, coarse: Level, fine: Level, valid: { ok: Uint8Array; list: number[] }) {
  const nnf = new Int32Array(fine.w * fine.h);
  for (let y = 0; y < fine.h; y++) {
    for (let x = 0; x < fine.w; x++) {
      const cx = Math.min(coarse.w - 1, x >> 1), cy = Math.min(coarse.h - 1, y >> 1);
      const s = prev[cy * coarse.w + cx];
      const sx = (s % coarse.w) * 2 + (x & 1), sy = ((s / coarse.w) | 0) * 2 + (y & 1);
      const cand = sy * fine.w + sx;
      nnf[y * fine.w + x] =
        sx >= 0 && sy >= 0 && sx < fine.w && sy < fine.h && valid.ok[cand]
          ? cand
          : valid.list[(Math.random() * valid.list.length) | 0];
    }
  }
  return nnf;
}

/** PatchMatch: improve each target's match by borrowing neighbours'
 *  matches (propagation) and trying random nearby ones (search). */
function patchMatch(
  L: Level,
  targets: number[],
  nnf: Int32Array,
  dist: Float32Array,
  valid: { ok: Uint8Array },
  iterations: number
) {
  const { w, h } = L;
  const isTarget = new Uint8Array(w * h);
  for (const t of targets) isTarget[t] = 1;
  const maxRadius = Math.max(w, h);

  const tryCand = (t: number, s: number) => {
    if (s < 0 || s >= w * h || !valid.ok[s]) return;
    const d = patchDistance(L, t, s, dist[t]);
    if (d < dist[t]) {
      dist[t] = d;
      nnf[t] = s;
    }
  };

  for (let it = 0; it < iterations; it++) {
    const forward = it % 2 === 0;
    const step = forward ? 1 : -1;
    for (let k = 0; k < targets.length; k++) {
      const t = targets[forward ? k : targets.length - 1 - k];
      const x = t % w, y = (t / w) | 0;

      // Propagation from the previous pixel in scan order (left/up or right/down)
      const nx = x - step, ny = y - step;
      // (a match shifted past a row edge lands on an invalid edge centre,
      // which tryCand rejects)
      if (nx >= 0 && nx < w && isTarget[y * w + nx]) tryCand(t, nnf[y * w + nx] + step);
      if (ny >= 0 && ny < h && isTarget[ny * w + x]) tryCand(t, nnf[ny * w + x] + step * w);

      // Random search in shrinking windows around the current match
      const bx = nnf[t] % w, by = (nnf[t] / w) | 0;
      for (let rad = maxRadius; rad >= 1; rad >>= 1) {
        const sx = bx + (((Math.random() * 2 - 1) * rad) | 0);
        const sy = by + (((Math.random() * 2 - 1) * rad) | 0);
        if (sx >= 0 && sy >= 0 && sx < w && sy < h) tryCand(t, sy * w + sx);
      }
    }
  }
}

/** Rebuild each hole pixel as a weighted average of what every
 *  overlapping patch's match says it should be. */
function vote(L: Level, targets: number[], nnf: Int32Array, dist: Float32Array) {
  const { w, h, img, hole } = L;
  const acc = new Float32Array(w * h * 3);
  const wsum = new Float32Array(w * h);
  const n = (2 * R + 1) * (2 * R + 1);

  for (const t of targets) {
    const weight = Math.exp(-dist[t] / (3 * n) / (2 * SIGMA * SIGMA)) + 1e-6;
    const tx = t % w, ty = (t / w) | 0;
    const s = nnf[t];
    const sx = s % w, sy = (s / w) | 0;
    for (let dy = -R; dy <= R; dy++) {
      const py = ty + dy;
      if (py < 0 || py >= h) continue;
      for (let dx = -R; dx <= R; dx++) {
        const px = tx + dx;
        if (px < 0 || px >= w) continue;
        const p = py * w + px;
        if (!hole[p]) continue;
        const q = ((sy + dy) * w + sx + dx) * 3;
        acc[p * 3] += img[q] * weight;
        acc[p * 3 + 1] += img[q + 1] * weight;
        acc[p * 3 + 2] += img[q + 2] * weight;
        wsum[p] += weight;
      }
    }
  }
  for (let p = 0; p < w * h; p++) {
    if (!hole[p] || !wsum[p]) continue;
    img[p * 3] = acc[p * 3] / wsum[p];
    img[p * 3 + 1] = acc[p * 3 + 1] / wsum[p];
    img[p * 3 + 2] = acc[p * 3 + 2] / wsum[p];
  }
}

/* ------------------------- low-frequency fix ------------------------- */

/** Patch copying gets texture right but can leave soft blotches of the
 *  wrong brightness (e.g. on gradients). So the fill keeps PatchMatch's
 *  fine detail but takes its broad light/colour from a smooth fill
 *  interpolated from the hole's surroundings:
 *    result = fill − blur(fill) + smooth(blurred surroundings)
 *  On repeating patterns both blurs are flat, so nothing changes. */
function correctLowFrequencies(levels: Level[], holeW: number, holeH: number) {
  const base = levels[0];
  const { w, h, img, hole } = base;
  const radius = Math.max(4, Math.min(24, Math.round(Math.min(holeW, holeH) / 3)));

  // 1. Surroundings, blurred using known pixels only
  const known = new Float32Array(w * h);
  const weighted = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    if (hole[i]) continue;
    known[i] = 1;
    for (let c = 0; c < 3; c++) weighted[i * 3 + c] = img[i * 3 + c];
  }
  const bw = blur(known, w, h, 1, radius);
  const bc = blur(weighted, w, h, 3, radius);
  const surroundings = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    if (bw[i] > 1e-3) for (let c = 0; c < 3; c++) surroundings[i * 3 + c] = bc[i * 3 + c] / bw[i];
  }

  // 2. Smooth (harmonic) fill of the hole from those, solved at the
  //    coarsest level (it's low-frequency anyway) and scaled back up
  const coarse = levels[levels.length - 1];
  const f = base.w / coarse.w;
  const smooth: Level = { w: coarse.w, h: coarse.h, img: new Float32Array(coarse.w * coarse.h * 3), hole: coarse.hole };
  for (let y = 0; y < coarse.h; y++) {
    for (let x = 0; x < coarse.w; x++) {
      const o = y * coarse.w + x;
      if (coarse.hole[o]) continue;
      const i = Math.min(h - 1, Math.round((y + 0.5) * f)) * w + Math.min(w - 1, Math.round((x + 0.5) * f));
      for (let c = 0; c < 3; c++) smooth.img[o * 3 + c] = surroundings[i * 3 + c];
    }
  }
  diffuseFill(smooth);
  relax(smooth, 150);

  // 3. Swap the fill's own low frequencies for the smooth ones
  const current = blur(img, w, h, 3, radius);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!hole[i]) continue;
      const target = bilinear(smooth, x / f - 0.5, y / f - 0.5);
      for (let c = 0; c < 3; c++) img[i * 3 + c] += target[c] - current[i * 3 + c];
    }
  }
}

/** Jacobi smoothing of the hole (known pixels stay fixed). */
function relax(L: Level, iterations: number) {
  const { w, h, img, hole } = L;
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!hole[i]) continue;
        for (let c = 0; c < 3; c++) {
          let s = 0;
          let n = 0;
          for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
            if (j < 0) continue;
            s += img[j * 3 + c];
            n++;
          }
          img[i * 3 + c] = s / n;
        }
      }
    }
  }
}

/** Two passes of a separable box blur (≈ a soft tent filter). */
function blur(src: Float32Array, w: number, h: number, ch: number, r: number) {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(a.length);
    for (let y = 0; y < h; y++) boxLine(a, tmp, y * w * ch, ch, w, ch, r);
    const out = new Float32Array(a.length);
    for (let x = 0; x < w; x++) boxLine(tmp, out, x * ch, w * ch, h, ch, r);
    a = out;
  }
  return a;
}

/** Running-sum box average along one row or column (edges clamped). */
function boxLine(src: Float32Array, dst: Float32Array, start: number, stride: number, n: number, ch: number, r: number) {
  const size = 2 * r + 1;
  for (let c = 0; c < ch; c++) {
    const at = (k: number) => src[start + Math.min(n - 1, Math.max(0, k)) * stride + c];
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += at(k);
    for (let k = 0; k < n; k++) {
      dst[start + k * stride + c] = sum / size;
      sum += at(k + r + 1) - at(k - r);
    }
  }
}

function bilinear(L: Level, fx: number, fy: number): [number, number, number] {
  const x0 = Math.max(0, Math.min(L.w - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(L.h - 1, Math.floor(fy)));
  const x1 = Math.min(L.w - 1, x0 + 1), y1 = Math.min(L.h - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = L.img[(y0 * L.w + x0) * 3 + c] * (1 - tx) + L.img[(y0 * L.w + x1) * 3 + c] * tx;
    const b = L.img[(y1 * L.w + x0) * 3 + c] * (1 - tx) + L.img[(y1 * L.w + x1) * 3 + c] * tx;
    out[c] = a * (1 - ty) + b * ty;
  }
  return out;
}

/** Each hole pixel takes the colour at the centre of its own match. */
function copyCentres(L: Level, nnf: Int32Array) {
  const { w, h, img, hole } = L;
  for (let p = 0; p < w * h; p++) {
    if (!hole[p]) continue;
    const q = nnf[p] * 3;
    img[p * 3] = img[q];
    img[p * 3 + 1] = img[q + 1];
    img[p * 3 + 2] = img[q + 2];
  }
}

function clampInt(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
