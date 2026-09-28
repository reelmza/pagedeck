"use client";

import { memo, useEffect, useRef, useState } from "react";
import { getTextRuns, renderPage, renderPixelWidth } from "@/lib/editor/render";
import type { EditorItem, ItemPatch, PageInfo, TextRemoval, TextRun, Tool } from "@/lib/editor/types";
import ItemView from "./ItemView";

/** Pages this far outside the visible area still get rendered, so they're
 *  ready by the time you scroll to them. */
const PRELOAD_MARGIN = "1200px 0px";

export interface PageHandlers {
  onPageTap: (page: number, x: number, y: number) => void;
  /** A line of existing text was tapped (with the page image shown now). */
  onRunTap: (page: number, run: TextRun, pageImage: string | null) => void;
  onVisibility: (page: number, ratio: number) => void;
  /** The page image currently on screen (smart erase works from it). */
  onImageShown: (page: number, url: string) => void;
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
  removals,
  previewUrl,
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
  removals: TextRemoval[];
  /** This page re-rendered with replaced text removed, once ready. */
  previewUrl: string | null;
  selectedId: string | null;
  editingId: string | null;
  tool: Tool;
  handlers: PageHandlers;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [runs, setRuns] = useState<TextRun[]>([]);
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
    renderPage(index, renderPixelWidth(cssWidth), () => wanted).then((url) => wanted && url && setSrc(url));
    return () => {
      wanted = false;
    };
  }, [near, index, cssWidth]);

  // Existing text lines — only looked up once Edit text is in use
  const editingText = tool === "edittext";
  useEffect(() => {
    if (!near || !editingText) return;
    let live = true;
    getTextRuns(index).then((r) => live && setRuns(r));
    return () => {
      live = false;
    };
  }, [near, editingText, index]);

  const shown = near ? (previewUrl ?? src) : null;
  const replaced = new Set(removals.map((r) => r.runId));

  useEffect(() => {
    if (shown) handlers.onImageShown(index, shown);
  }, [shown, index, handlers]);

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
          {/* Covers over replaced text: instant (sampled colour) until the
              clean preview arrives, or for good if it couldn't be removed */}
          {removals
            .filter((r) => r.found !== true)
            .map((r) => (
              <div
                key={r.id}
                className="pointer-events-none absolute"
                style={{
                  left: r.rect.x * scale,
                  top: r.rect.y * scale,
                  width: r.rect.w * scale,
                  height: r.rect.h * scale,
                  background: r.coverColor,
                }}
              />
            ))}

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

          {/* Tappable lines of existing text */}
          {editingText &&
            runs
              .filter((run) => !replaced.has(run.id))
              .map((run) => (
                <button
                  key={run.id}
                  type="button"
                  aria-label={`Edit "${run.text}"`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlers.onRunTap(index, run, shown);
                  }}
                  className="absolute cursor-text rounded-[2px] bg-accent/5 outline-1 outline-dashed outline-accent/50 transition-colors hover:bg-accent/15"
                  style={{
                    left: run.rect.x * scale,
                    top: run.rect.y * scale,
                    width: run.rect.w * scale,
                    height: run.rect.h * scale,
                  }}
                />
              ))}
        </div>
      </div>
      <p className="mt-1.5 text-center text-xs text-muted">Page {index + 1}</p>
    </div>
  );
}

export default memo(EditorPage);
