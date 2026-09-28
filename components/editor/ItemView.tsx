"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { fontCss, fontWeight, LINE_HEIGHT } from "@/lib/editor/fonts";
import type { EditorItem, ItemPatch } from "@/lib/editor/types";

/** Movement (screen px) before a press counts as a drag rather than a tap. */
const DRAG_THRESHOLD = 4;

/** iOS zooms the page when you type into text smaller than this. */
const IOS_MIN_FONT_PX = 16;

/** One placed item on a page — drag to move, corner handle to resize,
 *  tap a selected text box to type in it. Works with mouse and touch
 *  (pointer events, and touch-none so dragging doesn't scroll). */
export default function ItemView({
  item,
  scale,
  pageWidth,
  pageHeight,
  selected,
  editing,
  onSelect,
  onChange,
  onDelete,
  onStartEdit,
  onEndEdit,
}: {
  item: EditorItem;
  scale: number; // screen px per point
  pageWidth: number;
  pageHeight: number;
  selected: boolean;
  editing: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: ItemPatch) => void;
  onDelete: (id: string) => void;
  onStartEdit: (id: string) => void;
  onEndEdit: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    sx: number;
    sy: number;
    x0: number;
    y0: number;
    moved: boolean;
    wasSelected: boolean;
  } | null>(null);
  const resize = useRef<{
    sx: number;
    sy: number;
    w0: number;
    h0: number;
    size0: number;
    width0: number;
  } | null>(null);

  // Text lives in the DOM while typing (contentEditable); only sync it from
  // state when not editing, so React never fights the caret.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (item.kind === "text" && el && !editing && el.innerText !== item.text) {
      el.textContent = item.text;
    }
  }, [item, editing]);

  // Entering edit mode: focus and put the caret at the end
  useEffect(() => {
    const el = textRef.current;
    if (!editing || !el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  /* ---------------- move ---------------- */

  function onPointerDown(e: React.PointerEvent) {
    if (editing) return; // let the caret / text selection work
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      sx: e.clientX,
      sy: e.clientY,
      x0: item.x,
      y0: item.y,
      moved: false,
      wasSelected: selected,
    };
    onSelect(item.id);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_THRESHOLD) return;
    d.moved = true;
    // Keep at least the top-left corner on the page
    const x = clamp(d.x0 + (e.clientX - d.sx) / scale, 0, pageWidth - 8);
    const y = clamp(d.y0 + (e.clientY - d.sy) / scale, 0, pageHeight - 8);
    onChange(item.id, { x, y });
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    // Tapping an already-selected text box starts typing
    if (d && !d.moved && d.wasSelected && item.kind === "text") onStartEdit(item.id);
  }

  /* ---------------- resize ---------------- */

  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = {
      sx: e.clientX,
      sy: e.clientY,
      w0: "w" in item ? item.w : 0,
      h0: "h" in item ? item.h : 0,
      size0: item.kind === "text" ? item.size : 0,
      width0: (boxRef.current?.offsetWidth ?? 1) / scale,
    };
  }

  function onResizeMove(e: React.PointerEvent) {
    const r = resize.current;
    if (!r) return;
    const dx = (e.clientX - r.sx) / scale;
    if (item.kind === "text") {
      // Dragging the corner scales the text
      const size = clamp((r.size0 * (r.width0 + dx)) / r.width0, 6, 150);
      onChange(item.id, { size: Math.round(size * 2) / 2 });
    } else if (item.kind === "image") {
      // Images keep their proportions
      const w = Math.max(16, r.w0 + dx);
      onChange(item.id, { w, h: (w * r.h0) / r.w0 });
    } else {
      // White-out stretches freely
      const dy = (e.clientY - r.sy) / scale;
      onChange(item.id, { w: Math.max(8, r.w0 + dx), h: Math.max(6, r.h0 + dy) });
    }
  }

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Stop the page underneath treating this as a "place new item" tap
      onClick={(e) => e.stopPropagation()}
      className={`absolute touch-none select-none ${editing ? "cursor-text" : "cursor-move"} ${
        selected && !editing ? "outline-2 outline-offset-1 outline-accent" : ""
      }`}
      style={{
        left: item.x * scale,
        top: item.y * scale,
        ...(item.kind !== "text" && { width: item.w * scale, height: item.h * scale }),
      }}
    >
      {item.kind === "text" && (
        <div
          ref={textRef}
          contentEditable={editing ? "plaintext-only" : false}
          suppressContentEditableWarning
          data-placeholder="Type here"
          onBlur={(e) => {
            onChange(item.id, { text: e.currentTarget.innerText.replace(/\n$/, "") });
            onEndEdit();
          }}
          className={`min-w-[1ch] whitespace-pre empty:before:text-muted/60 empty:before:content-[attr(data-placeholder)] ${
            editing ? "select-text outline-1 outline-dashed outline-accent" : "outline-none"
          }`}
          style={{
            fontFamily: fontCss(item.font),
            fontWeight: fontWeight(item.font, item.bold),
            fontStyle: item.italic ? "italic" : "normal",
            lineHeight: LINE_HEIGHT,
            color: item.color,
            ...textSize(item.size * scale, editing),
          }}
        />
      )}

      {item.kind === "whiteout" && (
        // Faint dashed edge on screen only, so white boxes on white pages
        // can still be found — the saved PDF gets plain white
        <div className="h-full w-full bg-white outline outline-1 -outline-offset-1 outline-dashed outline-muted/30" />
      )}

      {item.kind === "patch" && (
        <div className="relative h-full w-full">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image.url} alt="Erased area" draggable={false} className="h-full w-full" />
          ) : (
            // Hatched until the fill is ready
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgb(37 99 235 / 0.16) 0 6px, transparent 6px 12px)",
              }}
            />
          )}
          {/* Screen-only edge so the box can be found again */}
          <div className="pointer-events-none absolute inset-0 outline-1 -outline-offset-1 outline-dashed outline-accent/40" />
          {item.busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/30">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            </div>
          )}
        </div>
      )}

      {item.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image.url} alt={item.signature ? "Signature" : "Image"} draggable={false} className="h-full w-full" />
      )}

      {selected && !editing && (
        <>
          <button
            type="button"
            aria-label="Delete"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="absolute -top-3.5 -right-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-danger text-white shadow"
          >
            <X className="h-4 w-4" />
          </button>
          {/* Big invisible touch target around a small visible handle */}
          <div
            aria-label="Resize"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={() => (resize.current = null)}
            onPointerCancel={() => (resize.current = null)}
            className="absolute -right-4 -bottom-4 flex h-8 w-8 cursor-nwse-resize items-center justify-center"
          >
            <span className="h-3.5 w-3.5 rounded-sm border-2 border-accent bg-white" />
          </div>
        </>
      )}
    </div>
  );
}

/** While typing, small text is drawn at 16px and scaled down to its real
 *  size — looks identical, but iOS no longer zooms the page in. (Doing
 *  this with the viewport meta tag instead would block pinch-zoom on
 *  Android.) */
function textSize(px: number, editing: boolean): React.CSSProperties {
  if (!editing || px >= IOS_MIN_FONT_PX) return { fontSize: px };
  return {
    fontSize: IOS_MIN_FONT_PX,
    transform: `scale(${px / IOS_MIN_FONT_PX})`,
    transformOrigin: "0 0",
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
