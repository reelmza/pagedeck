"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { FilePlus2, Loader2 } from "lucide-react";
import Sidebar from "./Sidebar";
import PageGrid from "./PageGrid";
import PageThumbnail from "./PageThumbnail";
import {
  closePdf,
  downloadBlob,
  exportPdf,
  openPdf,
  prefetchThumbs,
  setPrefetchPaused,
  setThumbProgressListener,
} from "@/lib/pdf";
import { nextFileColor, softColor } from "@/lib/colors";
import type { PageRef, PdfFile } from "@/lib/types";

/** Files larger than this are rejected on upload. */
const MAX_FILE_MB = 180;

/** crypto.randomUUID only exists on HTTPS/localhost; fall back so the
 *  app also works when opened over plain HTTP (e.g. phone via LAN IP). */
function newFileId(): string {
  return (
    crypto.randomUUID?.() ??
    `f-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/** Tips shown in random order on the loading screen. */
const LOADING_TIPS = [
  "Pre-loading files keep your experience smoother",
  "Thumbnail colors always match the sidebar files",
  "Downloading your file is instant after a pre-load",
  "Uploading new files will append them to the grid",
  "Select multiple pages by holding the shift key",
  "Ctrl+click a page to add or remove it from a selection",
  "With pages selected, click any card to move them all there",
  "Press Esc anytime to clear your selection",
  "Drop PDF files anywhere on the grid to add them",
  "Hover over a card to see which file it came from",
  "Your files never leave this device — everything runs offline",
];

/** Rotates through LOADING_TIPS randomly, never showing the same tip
 *  twice in a row, with a soft fade on each change. */
function LoadingTip() {
  const [tip, setTip] = useState(
    () => LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTip((current) => {
        const others = LOADING_TIPS.filter((t) => t !== current);
        return others[Math.floor(Math.random() * others.length)];
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    // key remounts the element per tip, restarting the fade animation
    <p key={tip} className="animate-[fade-in_0.6s_ease-out] text-xs text-muted/80 italic">
      {tip}
    </p>
  );
}

/** Top-level client component: owns all state and wires the pieces together. */
export default function PdfOrganizer() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [pages, setPages] = useState<PageRef[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null); // page being dragged
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-file preview preload progress, e.g. { fileId: { done: 12, total: 300 } }
  const [prep, setPrep] = useState<Record<string, { done: number; total: number }>>({});

  // Subscribe to render-queue progress. Updates are batched (every 5 pages)
  // so a 1000-page preload doesn't cause 1000 re-renders.
  useEffect(() => {
    setThumbProgressListener((fileId, done, total) => {
      if (done % 5 === 0 || done === total) {
        setPrep((prev) => ({ ...prev, [fileId]: { done, total } }));
      }
    });
    return () => setThumbProgressListener(null);
  }, []);

  // Mouse: require a small movement before a drag starts, so plain clicks
  // still select pages. Touch: require a short press, so swipes scroll the
  // grid instead of dragging cards.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  /* ---------------- files ---------------- */

  const addFiles = useCallback(async (list: FileList) => {
    setError(null);
    setLoading(true);
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(
          `"${file.name}" is ${Math.round(file.size / 1024 / 1024)}MB — ` +
            `the limit is ${MAX_FILE_MB}MB.`
        );
        continue;
      }
      try {
        const id = newFileId();
        const pageCount = await openPdf(id, file);
        // Preload every page's thumbnail so later scrolling and dragging
        // only ever hit the cache.
        prefetchThumbs(id, pageCount);
        // Seed progress state in the same render as the pages, so the
        // loading screen appears immediately — no flash of the grid.
        setPrep((prev) => ({ ...prev, [id]: { done: 0, total: pageCount } }));
        // Append the new file's pages to the end of the arrangement.
        setFiles((prev) => [
          ...prev,
          { id, name: file.name, file, pageCount, color: nextFileColor() },
        ]);
        setPages((prev) => [
          ...prev,
          ...Array.from({ length: pageCount }, (_, i) => ({
            id: `${id}:${i}`,
            fileId: id,
            pageIndex: i,
          })),
        ]);
      } catch (err) {
        // Show the real failure reason — a generic guess hides bugs.
        console.error("openPdf failed", err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Could not open "${file.name}": ${msg}`);
      }
    }
    setLoading(false);
  }, []);

  const removeFile = useCallback((fileId: string) => {
    closePdf(fileId); // frees worker memory, queued renders and thumbnails
    setPrep((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    setPages((prev) => prev.filter((p) => p.fileId !== fileId));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => !id.startsWith(fileId + ":")));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  /** Remove a single page from the arrangement. If it was the file's last
   *  page, drop the whole file too (frees its memory and sidebar entry). */
  const removePage = useCallback(
    (pageId: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (!page) return;
      const next = pages.filter((p) => p.id !== pageId);
      setPages(next);
      setSelected((prev) => {
        if (!prev.has(pageId)) return prev;
        const copy = new Set(prev);
        copy.delete(pageId);
        return copy;
      });
      if (!next.some((p) => p.fileId === page.fileId)) {
        removeFile(page.fileId);
      }
    },
    [pages, removeFile]
  );

  /* ---------------- selection ---------------- */

  const toggleSelect = useCallback((pageId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
    setLastSelectedId(pageId);
  }, []);

  /** Move all selected pages so they start at the target page's position,
   *  keeping their current relative order. */
  const moveSelectionTo = useCallback(
    (targetId: string) => {
      const moving = pages.filter((p) => selected.has(p.id));
      const remaining = pages.filter((p) => !selected.has(p.id));
      const targetIdx = remaining.findIndex((p) => p.id === targetId);
      if (targetIdx === -1) return;
      setPages([
        ...remaining.slice(0, targetIdx),
        ...moving,
        ...remaining.slice(targetIdx),
      ]);
      setSelected(new Set());
    },
    [pages, selected]
  );

  const handleCardClick = useCallback(
    (pageId: string, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(pageId);
      } else if (e.shiftKey && lastSelectedId) {
        // Range-select between the last clicked page and this one.
        const a = pages.findIndex((p) => p.id === lastSelectedId);
        const b = pages.findIndex((p) => p.id === pageId);
        if (a === -1 || b === -1) return;
        const range = pages.slice(Math.min(a, b), Math.max(a, b) + 1).map((p) => p.id);
        setSelected((prev) => new Set([...prev, ...range]));
      } else if (selected.size > 0) {
        // A selection exists: clicking a selected page cancels it,
        // clicking any other page moves the selection there.
        if (selected.has(pageId)) setSelected(new Set());
        else moveSelectionTo(pageId);
      }
    },
    [pages, selected, lastSelectedId, toggleSelect, moveSelectionTo]
  );

  // Escape clears the current selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- drag & drop ---------------- */

  const onDragStart = useCallback((e: DragStartEvent) => {
    setPrefetchPaused(true); // keep the main thread free while dragging
    setActiveId(String(e.active.id));
  }, []);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setPrefetchPaused(false);
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === active.id);
      const to = prev.findIndex((p) => p.id === over.id);
      return from === -1 || to === -1 ? prev : arrayMove(prev, from, to);
    });
  }, []);

  const activePage = activeId ? pages.find((p) => p.id === activeId) : null;

  /* ---------------- export ---------------- */

  const handleExport = useCallback(async () => {
    setError(null);
    setExporting(true);
    try {
      const blob = await exportPdf(files, pages);
      downloadBlob(blob, "organized.pdf");
    } catch {
      setError("Export failed — one of the files could not be read.");
    } finally {
      setExporting(false);
    }
  }, [files, pages]);

  /* ---------------- layout ---------------- */

  // Stable reference so memoized page cards don't re-render on every state change.
  const fileMeta = useMemo(
    () => new Map(files.map((f) => [f.id, { name: f.name, color: f.color }])),
    [files]
  );

  // Combined preview-preload progress across all files.
  const prepTotals = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const p of Object.values(prep)) {
      done += p.done;
      total += p.total;
    }
    return { done, total };
  }, [prep]);
  const preloading = prepTotals.total > 0 && prepTotals.done < prepTotals.total;

  return (
    // Mobile: sidebar stacks on top of the grid (12/12); md+: 2/10 columns.
    // dvh, not vh: tracks the real visible height under mobile browser bars.
    <div className="flex h-dvh flex-col md:grid md:grid-cols-12">
      <Sidebar
        files={files}
        loading={loading}
        exporting={exporting}
        error={error}
        onAddFiles={addFiles}
        onRemoveFile={removeFile}
        onExport={handleExport}
      />

      <main
        className="min-h-0 flex-1 overflow-y-auto md:col-span-10 md:h-dvh"
        // Allow dropping PDF files anywhere on the grid area.
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
      >
        {/* Status bar: page count + selection hint */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur md:px-6 md:py-3">
          <p className="shrink-0 text-xs text-muted">
            {pages.length} page{pages.length === 1 ? "" : "s"}
          </p>
          {selected.size > 0 && (
            <p className="rounded-full bg-accent-soft px-3 py-1 text-xs text-accent">
              {selected.size} selected — click a page to move the selection there, or
              press Esc
            </p>
          )}
        </div>

        <div className="p-3 md:p-6">
          {loading || preloading ? (
            /* Blocking loader: shown from the moment a file is picked
               (parsing phase) until every preview is rendered, so all
               interaction afterwards is pure cache hits. */
            <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-muted">
                {preloading ? "Preparing page previews…" : "Opening file…"}
              </p>
              {preloading && (
                <>
                  <div className="h-1.5 w-64 overflow-hidden rounded-full bg-accent-soft">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${(prepTotals.done / prepTotals.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted">
                    {prepTotals.done} / {prepTotals.total} pages
                  </p>
                </>
              )}
              <LoadingTip />
            </div>
          ) : pages.length === 0 ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border text-muted">
              <FilePlus2 className="h-10 w-10 shrink-0 text-accent/40" />
              <p className="text-sm">
                Drop PDF files here, or use <span className="text-accent">Add File</span>
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              // Re-measure drop targets as virtualized cards mount during
              // auto-scroll, so drops land correctly anywhere in the grid.
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={() => {
                setPrefetchPaused(false);
                setActiveId(null);
              }}
            >
              <PageGrid
                pages={pages}
                fileMeta={fileMeta}
                selected={selected}
                activeId={activeId}
                onToggleSelect={toggleSelect}
                onCardClick={handleCardClick}
                onRemovePage={removePage}
              />

              {/* Faint ghost copy of the dragged card, following the mouse */}
              <DragOverlay dropAnimation={null}>
                {activePage && (
                  <div
                    className="w-full rounded-lg border bg-card p-2 opacity-60 shadow-lg"
                    style={{
                      borderColor: softColor(
                        fileMeta.get(activePage.fileId)?.color ?? "var(--border)"
                      ),
                    }}
                  >
                    <PageThumbnail
                      fileId={activePage.fileId}
                      pageIndex={activePage.pageIndex}
                    />
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </main>
    </div>
  );
}
