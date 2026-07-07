"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, X } from "lucide-react";
import PageThumbnail from "./PageThumbnail";
import { softColor } from "@/lib/colors";
import { getCachedThumb } from "@/lib/pdf";
import type { PageRef } from "@/lib/types";

type Props = {
  page: PageRef;
  /** Position in the current arrangement (0-based). */
  index: number;
  fileName: string;
  /** Outline color of the card's source file. */
  fileColor: string;
  selected: boolean;
  /** True while any selection exists — a plain click then means "move here". */
  selectionActive: boolean;
  /** Keep the real card mounted even when offscreen (the card being dragged). */
  forceMount: boolean;
  onToggleSelect: (pageId: string, e: React.MouseEvent) => void;
  onClick: (pageId: string, e: React.MouseEvent) => void;
  onRemove: (pageId: string) => void;
};

/**
 * Virtualization wrapper: cards far from the viewport render as a cheap
 * static placeholder instead of a live sortable card. dnd-kit measures and
 * re-renders every mounted sortable when a drag starts, so this keeps drag
 * initialization fast regardless of how many pages the document has.
 */
function PageCard(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Mount real cards a bit before they scroll into view.
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {inView || props.forceMount ? (
        <SortableCard {...props} />
      ) : (
        <PlaceholderCard
          page={props.page}
          index={props.index}
          fileColor={props.fileColor}
          selected={props.selected}
        />
      )}
    </div>
  );
}

/** The real card: draggable, selectable, renders its thumbnail. */
function SortableCard({
  page,
  index,
  fileName,
  fileColor,
  selected,
  selectionActive,
  onToggleSelect,
  onClick,
  onRemove,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderColor: softColor(fileColor), // faint outline matching the source file
      }}
      {...attributes}
      {...listeners}
      onClick={(e) => onClick(page.id, e)}
      title={fileName}
      // touch-manipulation: no double-tap zoom delay; long-press starts a drag
      className={`group relative cursor-grab touch-manipulation rounded-lg border bg-card p-1.5 shadow-sm transition-shadow select-none hover:shadow-md md:p-2 ${
        selected ? "ring-2 ring-accent/60" : ""
      } ${isDragging ? "opacity-30" : ""} ${
        selectionActive && !selected ? "hover:ring-2 hover:ring-accent/30" : ""
      }`}
    >
      {/* Selection toggle — visible on hover or while selected */}
      <button
        type="button"
        aria-label={selected ? "Deselect page" : "Select page"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(page.id, e);
        }}
        // Stop dnd-kit's pointer sensor so a checkbox press never starts a drag
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${
          selected
            ? "border-accent bg-accent text-white opacity-100"
            : // Always visible on mobile (no hover on touch), hover-revealed on md+
              "border-border bg-white md:opacity-0 md:group-hover:opacity-100"
        }`}
      >
        {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>

      {/* Remove page — visible on hover (md+) or always (mobile) */}
      <button
        type="button"
        aria-label="Remove page"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(page.id);
        }}
        // Stop dnd-kit's pointer sensor so pressing X never starts a drag
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border border-border bg-white text-muted transition-opacity hover:border-danger/40 hover:bg-danger/10 hover:text-danger md:opacity-0 md:group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>

      <PageThumbnail fileId={page.fileId} pageIndex={page.pageIndex} />

      {/* Faint page number under the card */}
      <div className="pt-1.5 text-center text-xs text-muted/70">{index + 1}</div>
    </div>
  );
}

/** Same footprint as a real card but no hooks, listeners, or dnd-kit
 *  registration — just the cached thumbnail (if any) and the page number. */
function PlaceholderCard({
  page,
  index,
  fileColor,
  selected,
}: {
  page: PageRef;
  index: number;
  fileColor: string;
  selected: boolean;
}) {
  const url = getCachedThumb(page.fileId, page.pageIndex);
  return (
    <div
      style={{ borderColor: softColor(fileColor) }}
      className={`rounded-lg border bg-card p-1.5 shadow-sm md:p-2 ${
        selected ? "ring-2 ring-accent/60" : ""
      }`}
    >
      <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md bg-white">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Page ${page.pageIndex + 1}`}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        )}
      </div>
      <div className="pt-1.5 text-center text-xs text-muted/70">{index + 1}</div>
    </div>
  );
}

// memo: when a drag starts only the dragged card's props change, so the
// other (potentially thousands of) cards skip re-rendering entirely.
export default memo(PageCard);
