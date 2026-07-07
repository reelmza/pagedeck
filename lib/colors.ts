/** Golden-angle hue rotation: consecutive colors are maximally spread
 *  around the color wheel, so files added one after another never get
 *  confusingly similar outlines. */
const GOLDEN_ANGLE = 137.508;

/** Random starting point so each session gets a fresh palette. */
let hue = Math.random() * 360;

/** Color assigned to each newly uploaded file. Used at full strength in
 *  the sidebar file list; card outlines use softColor() below. */
export function nextFileColor(): string {
  hue = (hue + GOLDEN_ANGLE) % 360;
  return `hsl(${Math.round(hue)} 65% 45%)`;
}

/** Faint, white-tinted version of a file color — subtle card outlines. */
export function softColor(color: string): string {
  return `color-mix(in srgb, ${color} 35%, white)`;
}
