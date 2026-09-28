"use client";

import { memo, useEffect, useRef, useState } from "react";
import { renderPage } from "@/lib/editor/render";
import type { EditorItem, ItemPatch, PageInfo, Tool } from "@/lib/editor/types";
import ItemView from "./ItemView";

/** Pages this far outside the visible area still get rendered, so they're
 *  ready by the time you scroll to them. */
const PRELOAD_MARGIN = "1200px 0px";

/** Render widths snap up to these steps so small window resizes reuse
 *  the cached render instead of drawing the page again. */
const WIDTH_STEP = 200;

export interface PageHandlers {
  onPageTap: (page: number, x: number, y: number) => void;
  onVisibility: (page: number, ratio: number) => void;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: ItemPatch) => void;
  onDelete: (id: string) => void;
  onStartEdit: (id: string) => void;
  onEndEdit: () => void;
}

/** One PDF page with its placed items. The page image is only kept while
 *  the page is near the screen — memory stays flat on long documents. */
function EditorPage({
  index,
  info,
  cssWidth,
  scrollRoot,
  items,
  selectedId,
  editingId,
  tool,
  handlers,
}: {
  index: number;
  info: PageInfo;
  cssWidth: number;
  scrollRoot: HTMLElement | null;
  items: EditorItem[];
  selectedId: string | null;
  editingId: string | null;
  tool: Tool;
  handlers: PageHandlers;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const scale = cssWidth / info.width;

  // Near the screen? (drives rendering) and how much is visible? (tells
  // the editor which page new signatures/images should go on)
  useEffect(() => {
    const el = ref.current;
    if (!el || !scrollRoot) return;
    const nearIo = new IntersectionObserver(([e]) => setNear(e.isIntersecting), {
      root: scrollRoot,
      rootMargin: PRELOAD_MARGIN,
    });
    const visibleIo = new IntersectionObserver(
      ([e]) => handlers.onVisibility(index, e.intersectionRatio),
      { root: scrollRoot, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );
    nearIo.observe(el);
    visibleIo.observe(el);
    return () => {
      nearIo.disconnect();
      visibleIo.disconnect();
    };
  }, [scrollRoot, index, handlers]);

  useEffect(() => {
    if (!near || !cssWidth) return;
    let wanted = true;
    // Sharp on retina screens, but capped at 2× to keep phones light
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.ceil((cssWidth * dpr) / WIDTH_STEP) * WIDTH_STEP;
    renderPage(index, px, () => wanted).then((url) => wanted && url && setSrc(url));
    return () => {
      wanted = false;
    };
  }, [near, index, cssWidth]);

  const shown = near ? src : null;

  return (
    <div>
      <div
        ref={ref}
        data-page={index}
        className="relative mx-auto overflow-hidden bg-white shadow-sm ring-1 ring-border"
        style={{ width: cssWidth, height: info.height * scale }}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none" />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-accent-soft/30" />
        )}

        {/* Item layer — taps on empty space place the current tool */}
        <div
          className={`absolute inset-0 ${tool === "select" ? "" : "cursor-crosshair"}`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            handlers.onPageTap(index, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
          }}
        >
          {items.map((item) => (
            <ItemView
              key={item.id}
              item={item}
              scale={scale}
              pageWidth={info.width}
              pageHeight={info.height}
              selected={item.id === selectedId}
              editing={item.id === editingId}
              onSelect={handlers.onSelect}
              onChange={handlers.onChange}
              onDelete={handlers.onDelete}
              onStartEdit={handlers.onStartEdit}
              onEndEdit={handlers.onEndEdit}
            />
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-center text-xs text-muted">Page {index + 1}</p>
    </div>
  );
}

export default memo(EditorPage);
