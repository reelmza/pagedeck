"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { FONT_CATEGORIES, FONT_KEYS, FONTS, previewCss } from "@/lib/editor/fonts";
import type { FontKey } from "@/lib/editor/types";

const PANEL_WIDTH = 256;

/** Dropdown of every editor font, grouped by style, each name shown in
 *  its own font (tiny name-only preview files — the full font downloads
 *  only when picked). The panel is portalled to <body> so the scrolling toolbar
 *  it opens from can't clip it. */
export default function FontPicker({
  value,
  onChange,
}: {
  value: FontKey;
  onChange: (key: FontKey) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = pos !== null;

  // Close on outside tap, Escape, resize, or when the page scrolls
  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel?.contains(t) && !button.current?.contains(t)) close();
    };
    const onScroll = (e: Event) => {
      if (!panel?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, panel]);

  function toggle() {
    if (open) return setPos(null);
    const r = button.current!.getBoundingClientRect();
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8)),
    });
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-40 shrink-0 items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-sm text-foreground hover:bg-accent-soft/40"
      >
        <span className="truncate" style={{ fontFamily: previewCss(value) }}>
          {FONTS[value].label}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>

      {open &&
        createPortal(
          <div
            ref={setPanel}
            role="listbox"
            aria-label="Font"
            // Keep focus in the text box being edited
            onMouseDown={(e) => e.preventDefault()}
            className="fixed z-50 max-h-[min(60vh,420px)] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
            style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH }}
          >
            {FONT_CATEGORIES.map((category) => (
              <div key={category}>
                <p className="px-2.5 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted uppercase">
                  {category}
                </p>
                {FONT_KEYS.filter((k) => FONTS[k].category === category).map((key) => (
                  <FontRow
                    key={key}
                    fontKey={key}
                    selected={key === value}
                    onPick={() => {
                      onChange(key);
                      setPos(null);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

/** One font in the list, its name shown in the tiny preview font. */
function FontRow({ fontKey, selected, onPick }: { fontKey: FontKey; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[15px] ${
        selected ? "bg-accent-soft text-accent" : "text-foreground hover:bg-accent-soft/40"
      }`}
    >
      <span className="truncate" style={{ fontFamily: previewCss(fontKey) }}>
        {FONTS[fontKey].label}
      </span>
      {selected && <Check className="h-4 w-4 shrink-0" />}
    </button>
  );
}
