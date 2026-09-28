"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Eraser,
  FilePlus2,
  FolderOpen,
  ImagePlus,
  Loader2,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Type,
} from "lucide-react";
import { downloadBlob } from "@/lib/pdf";
import { FONTS, TEXT_COLORS } from "@/lib/editor/fonts";
import { imageFromFile, newId } from "@/lib/editor/images";
import { closeEditorDoc, openEditorDoc } from "@/lib/editor/render";
import { saveEditedPdf } from "@/lib/editor/save";
import type {
  EditorImage,
  EditorItem,
  FontKey,
  ItemPatch,
  PageInfo,
  TextItem,
  Tool,
} from "@/lib/editor/types";
// Single source of truth for the app version — bump with `npm version`.
import { version } from "@/package.json";
import EditorPage, { type PageHandlers } from "./EditorPage";
import SignatureDialog from "./SignatureDialog";

/** Same upload limit as the organizer and compressor. */
const MAX_FILE_MB = 180;

/** Pages never display wider than this, even on big monitors. */
const MAX_PAGE_WIDTH = 900;

const EMPTY: EditorItem[] = [];

const HINTS: Record<Tool, string> = {
  select: "Tap an item to select it — tap selected text to type",
  text: "Tap the page where the text should go",
  whiteout: "Tap the page to cover something with white",
};

type Status = "empty" | "loading" | "ready" | "saving";

/** Top-level client component for /pdf-edit. Same shell as the organizer
 *  and compressor (tool sidebar + main, stacked on mobile). */
export default function PdfEditor({ handwritingFont }: { handwritingFont: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [items, setItems] = useState<EditorItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [status, setStatus] = useState<Status>("empty");
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [cssWidth, setCssWidth] = useState(0);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  // Last-used text style — new text boxes start with it
  const [textStyle, setTextStyle] = useState<{ size: number; font: FontKey; color: string }>({
    size: 14,
    font: "sans",
    color: TEXT_COLORS[0],
  });

  const listRef = useRef<HTMLDivElement>(null);
  const keyboardProxy = useRef<HTMLInputElement>(null);
  const visibility = useRef(new Map<number, number>());
  // Latest values for the (stable) page handlers to read
  const live = useRef({ tool, textStyle, pages, items });
  useEffect(() => {
    live.current = { tool, textStyle, pages, items };
  }, [tool, textStyle, pages, items]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const ready = status === "ready" || status === "saving";

  /* ---------------- layout ---------------- */

  // Pages fill the available width (up to a cap) and follow resizes
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setCssWidth(Math.min(MAX_PAGE_WIDTH, Math.floor(entry.contentRect.width)))
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------- file ---------------- */

  const openFile = useCallback(async (f: File) => {
    setError(null);
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`"${f.name}" is ${Math.round(f.size / 1024 / 1024)}MB — the limit is ${MAX_FILE_MB}MB.`);
      return;
    }
    const current = live.current.items;
    if (current.length > 0 && !window.confirm("Open another file? Your unsaved edits will be lost.")) {
      return;
    }
    revokeImages(current);
    setStatus("loading");
    setItems([]);
    setSelectedId(null);
    setEditingId(null);
    visibility.current.clear();
    try {
      const info = await openEditorDoc(f);
      setFile(f);
      setPages(info);
      setStatus("ready");
    } catch (err) {
      console.error("openEditorDoc failed", err);
      setFile(null);
      setPages([]);
      setStatus("empty");
      setError(
        err instanceof Error && err.name === "PasswordException"
          ? "This PDF is password-protected, so it can't be edited here."
          : "Couldn't open that file — is it a valid PDF?"
      );
    }
  }, []);

  // Free the document and images when leaving the page
  useEffect(
    () => () => {
      closeEditorDoc();
      revokeImages(live.current.items);
    },
    []
  );

  // Warn before refresh/close while there are unsaved edits
  useEffect(() => {
    if (items.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [items.length]);

  async function save() {
    if (!file) return;
    setError(null);
    setEditingId(null);
    setStatus("saving");
    try {
      const blob = await saveEditedPdf(file, items);
      downloadBlob(blob, `${file.name.replace(/\.pdf$/i, "")}-edited.pdf`);
    } catch (err) {
      console.error("saveEditedPdf failed", err);
      setError(err instanceof Error ? err.message : "Couldn't save the PDF.");
    } finally {
      setStatus("ready");
    }
  }

  /* ---------------- items ---------------- */

  const addItem = useCallback((item: EditorItem) => {
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
  }, []);

  const updateItem = useCallback((id: string, patch: ItemPatch) => {
    setItems((prev) => prev.map((i) => (i.id === id ? ({ ...i, ...patch } as EditorItem) : i)));
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id);
      // Free the image unless another item still shows it
      if (gone?.kind === "image" && !prev.some((i) => i !== gone && i.kind === "image" && i.image.id === gone.image.id)) {
        URL.revokeObjectURL(gone.image.url);
      }
      return prev.filter((i) => i.id !== id);
    });
    setSelectedId(null);
    setEditingId(null);
  }, []);

  /** iOS only opens the keyboard if focus happens inside the tap itself.
   *  New text boxes don't exist yet at that moment, so focus a hidden input
   *  now; the box takes focus over from it once it renders. */
  const primeKeyboard = useCallback(() => {
    keyboardProxy.current?.focus({ preventScroll: true });
  }, []);

  /** Centre of the visible part of a page, in points — where new
   *  signatures and images land. */
  const visibleCentre = useCallback((page: number) => {
    const info = live.current.pages[page];
    const el = document.querySelector<HTMLElement>(`[data-page="${page}"]`);
    const root = el?.closest("main");
    if (!info) return { x: 0, y: 0 };
    if (!el || !root) return { x: info.width / 2, y: info.height / 2 };
    const r = el.getBoundingClientRect();
    const v = root.getBoundingClientRect();
    const scale = r.width / info.width;
    const top = Math.max(r.top, v.top);
    const bottom = Math.min(r.bottom, v.bottom);
    return { x: info.width / 2, y: ((top + bottom) / 2 - r.top) / scale };
  }, []);

  /** The page taking up most of the screen right now. */
  const activePage = useCallback(() => {
    let best = 0;
    let bestRatio = -1;
    for (const [page, ratio] of visibility.current) {
      if (ratio > bestRatio) [best, bestRatio] = [page, ratio];
    }
    return best;
  }, []);

  /** Drop an image (signature or picture) onto the page in view. */
  const placeImage = useCallback(
    (image: EditorImage, signature: boolean) => {
      const page = activePage();
      const info = live.current.pages[page];
      if (!info) return;
      const w = Math.min(signature ? 170 : 240, info.width * 0.5);
      const h = (w * image.height) / image.width;
      const c = visibleCentre(page);
      addItem({
        kind: "image",
        id: newId("item"),
        page,
        x: Math.max(0, c.x - w / 2),
        y: Math.max(0, Math.min(info.height - h, c.y - h / 2)),
        w,
        h,
        image,
        signature,
      });
      setTool("select");
    },
    [activePage, visibleCentre, addItem]
  );

  async function addImageFile(f: File) {
    setError(null);
    try {
      placeImage(await imageFromFile(f), false);
    } catch {
      setError("Couldn't read that image. Try a JPG or PNG.");
    }
  }

  // Stable handler object so pages only re-render when their own items change
  const handlers = useMemo<PageHandlers>(
    () => ({
      onPageTap: (page, x, y) => {
        const { tool, textStyle, pages } = live.current;
        const info = pages[page];
        if (tool === "text") {
          primeKeyboard();
          const item: TextItem = {
            kind: "text",
            id: newId("item"),
            page,
            // Tap point becomes roughly the middle of the first line
            x,
            y: Math.max(0, y - textStyle.size * 0.6),
            text: "",
            ...textStyle,
          };
          addItem(item);
          setEditingId(item.id);
          setTool("select");
        } else if (tool === "whiteout") {
          const w = 120;
          const h = 24;
          addItem({
            kind: "whiteout",
            id: newId("item"),
            page,
            x: Math.max(0, Math.min(info.width - w, x - w / 2)),
            y: Math.max(0, Math.min(info.height - h, y - h / 2)),
            w,
            h,
          });
          setTool("select");
        } else {
          setSelectedId(null);
        }
      },
      onVisibility: (page, ratio) => visibility.current.set(page, ratio),
      onSelect: (id) => setSelectedId(id),
      onChange: updateItem,
      onDelete: deleteItem,
      onStartEdit: (id) => {
        primeKeyboard();
        setEditingId(id);
      },
      onEndEdit: () => {
        setEditingId(null);
        // An empty text box is dropped when you stop typing
        setItems((prev) => prev.filter((i) => i.kind !== "text" || i.text.trim() !== ""));
      },
    }),
    [addItem, updateItem, deleteItem, primeKeyboard]
  );

  // Keyboard shortcuts (desktop): Delete removes, Escape deselects
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingId || signing) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        deleteItem(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, editingId, signing, deleteItem]);

  const itemsByPage = useMemo(() => {
    const map = new Map<number, EditorItem[]>();
    for (const item of items) map.set(item.page, [...(map.get(item.page) ?? []), item]);
    return map;
  }, [items]);

  /** Apply a text style change to the selected text box and remember it. */
  function styleText(patch: Partial<{ size: number; font: FontKey; color: string }>) {
    setTextStyle((s) => ({ ...s, ...patch }));
    if (selected?.kind === "text") updateItem(selected.id, patch);
  }

  /* ---------------- UI ---------------- */

  const toolButton = (
    key: string,
    label: string,
    Icon: typeof Type,
    active: boolean,
    onClick?: () => void
  ) => (
    <button
      key={key}
      type="button"
      disabled={!ready}
      onClick={onClick}
      className={`flex min-w-16 flex-1 flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-40 md:min-w-0 md:flex-none md:flex-row md:gap-2 md:px-3 md:py-2 md:text-xs ${
        active
          ? "border-accent/40 bg-accent-soft/60 font-medium text-accent"
          : "border-border text-foreground hover:bg-accent-soft/30"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );

  const openLabel = (className: string, children: React.ReactNode) => (
    // The invisible input is stretched over the button face, so a tap lands
    // on the input itself — fully native on iOS (same trick as the other tools)
    <label className={`relative cursor-pointer ${className}`}>
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openFile(f);
          e.target.value = "";
        }}
      />
      {children}
    </label>
  );

  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-12">
      <aside className="flex flex-col border-b border-border bg-card md:col-span-2 md:h-dvh md:border-r md:border-b-0">
        <div className="hidden items-center justify-between border-b border-border px-4 py-3 md:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/app-assets/PageDeck_Logo_NoBG.svg" alt="PageDeck" className="h-6 w-auto" />
          <p className="text-xs text-muted">Version {version}</p>
        </div>

        {/* Tools — a scrollable row on mobile, a list on md+ */}
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-visible md:p-3">
          <p className="hidden px-1 pb-1 text-xs font-medium text-muted md:block">Tools</p>
          {toolButton("select", "Select", MousePointer2, tool === "select", () => setTool("select"))}
          {toolButton("text", "Text", Type, tool === "text", () => setTool("text"))}
          {toolButton("whiteout", "White-out", Eraser, tool === "whiteout", () => setTool("whiteout"))}
          {toolButton("sign", "Sign", PenLine, signing, () => {
            setTool("select");
            setSigning(true);
          })}
          {/* Image picker uses the same stretched-input trick */}
          <label
            className={`relative flex min-w-16 flex-1 cursor-pointer flex-col items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-foreground transition-colors hover:bg-accent-soft/30 md:min-w-0 md:flex-none md:flex-row md:gap-2 md:px-3 md:py-2 md:text-xs ${
              ready ? "" : "pointer-events-none opacity-40"
            }`}
          >
            <input
              type="file"
              accept="image/*"
              disabled={!ready}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void addImageFile(f);
                e.target.value = "";
              }}
            />
            <ImagePlus className="h-4 w-4 shrink-0" />
            Image
          </label>

          {error && <p className="hidden px-1 pt-3 text-xs text-danger md:block">{error}</p>}
        </div>

        {/* Actions — md+ only; on mobile they live in the status bar */}
        <div className="hidden flex-col gap-2 border-t border-border p-3 md:flex">
          {openLabel(
            "flex w-full items-center justify-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft/60 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent-soft",
            <>
              <FolderOpen className="h-3.5 w-3.5" /> {file ? "Open another" : "Open PDF"}
            </>
          )}
          <button
            type="button"
            disabled={!ready || items.length === 0 || status === "saving"}
            onClick={save}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {status === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download PDF
          </button>
        </div>
      </aside>

      <main
        ref={setScrollRoot}
        className="min-h-0 flex-1 overflow-y-auto md:col-span-10 md:h-dvh"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void openFile(f);
        }}
      >
        {/* Status bar */}
        <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-6 md:py-3">
            <div className="flex min-w-0 items-center gap-2">
              {/* Client-side navigation skips beforeunload, so warn here */}
              <Link
                href="/"
                aria-label="Back to homepage"
                onClick={(e) => {
                  if (items.length > 0 && !window.confirm("Leave the editor? Your unsaved edits will be lost.")) {
                    e.preventDefault();
                  }
                }}
                className="-ml-1 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-accent-soft/60 hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <p className="truncate text-xs text-muted">
                {file ? `${file.name} · ${pages.length} page${pages.length === 1 ? "" : "s"}` : "No file open"}
              </p>
            </div>
            {ready && <p className="hidden shrink-0 text-xs text-muted lg:block">{HINTS[tool]}</p>}

            {/* Mobile actions */}
            <div className="flex shrink-0 items-center gap-1.5 md:hidden">
              {openLabel(
                "rounded-md p-1.5 text-accent hover:bg-accent-soft/60",
                <FolderOpen className="h-4.5 w-4.5" aria-label="Open PDF" />
              )}
              <button
                type="button"
                aria-label="Download PDF"
                disabled={!ready || items.length === 0 || status === "saving"}
                onClick={save}
                className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {status === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          </div>

          {/* Text controls — shown while a text box is selected */}
          {selected?.kind === "text" && (
            <div
              // Keep focus in the text box while tapping these
              onMouseDown={(e) => e.preventDefault()}
              className="scrollbar-hide flex items-center gap-3 overflow-x-auto border-t border-border px-4 py-2 md:px-6"
            >
              <div className="flex shrink-0 gap-1">
                {(Object.keys(FONTS) as FontKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => styleText({ font: key })}
                    style={{ fontFamily: FONTS[key].css }}
                    className={`rounded-md px-2.5 py-1 text-sm ${
                      selected.font === key ? "bg-accent-soft text-accent" : "text-foreground hover:bg-accent-soft/40"
                    }`}
                  >
                    {FONTS[key].label}
                  </button>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Smaller text"
                  onClick={() => styleText({ size: Math.max(6, selected.size - 1) })}
                  className="rounded-md p-1 text-foreground hover:bg-accent-soft/40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-xs tabular-nums text-foreground">{selected.size}pt</span>
                <button
                  type="button"
                  aria-label="Larger text"
                  onClick={() => styleText({ size: Math.min(150, selected.size + 1) })}
                  className="rounded-md p-1 text-foreground hover:bg-accent-soft/40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => styleText({ color: c })}
                    className={`h-6 w-6 rounded-full border-2 ${selected.color === c ? "border-accent" : "border-transparent"}`}
                  >
                    <span className="block h-full w-full rounded-full" style={{ background: c }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mobile-only hint and errors */}
        {(ready || error) && (
          <p className={`px-4 pt-2 text-xs md:hidden ${error ? "text-danger" : "text-muted"}`}>
            {error ?? HINTS[tool]}
          </p>
        )}

        <div ref={listRef} className="p-3 md:p-6">
          {status === "loading" ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
              <p className="text-sm">Opening PDF…</p>
            </div>
          ) : !file ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border text-muted">
              <FilePlus2 className="h-10 w-10 shrink-0 text-accent/40" />
              <p className="px-6 text-center text-sm">Drop a PDF here to add text, white-out, images or your signature</p>
              {openLabel(
                "mt-1 flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90",
                <>
                  <FolderOpen className="h-4 w-4" /> Open PDF
                </>
              )}
              {error && <p className="hidden px-6 text-center text-sm text-danger md:block">{error}</p>}
            </div>
          ) : (
            <div className="space-y-5">
              {pages.map((info, i) => (
                <EditorPage
                  key={i}
                  index={i}
                  info={info}
                  cssWidth={cssWidth}
                  scrollRoot={scrollRoot}
                  items={itemsByPage.get(i) ?? EMPTY}
                  selectedId={selectedId}
                  editingId={editingId}
                  tool={tool}
                  handlers={handlers}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {signing && (
        <SignatureDialog
          handwritingFont={handwritingFont}
          onClose={() => setSigning(false)}
          onDone={(image) => {
            setSigning(false);
            placeImage(image, true);
          }}
        />
      )}

      {/* Receives focus first so iOS opens the keyboard (see primeKeyboard).
          16px so iOS doesn't zoom when it's focused. */}
      <input
        ref={keyboardProxy}
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed top-0 left-0 h-px w-px text-base opacity-0"
      />
    </div>
  );
}

function revokeImages(items: EditorItem[]) {
  const urls = new Set(items.flatMap((i) => (i.kind === "image" ? [i.image.url] : [])));
  urls.forEach((u) => URL.revokeObjectURL(u));
}
