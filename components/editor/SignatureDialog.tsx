"use client";

import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Loader2, Upload, X } from "lucide-react";
import {
  canvasToImage,
  dataUrlToCanvas,
  fileToCanvas,
  forgetSignature,
  loadSavedSignature,
  removePaperBackground,
  saveSignature,
  trimTransparent,
} from "@/lib/editor/images";
import type { EditorImage } from "@/lib/editor/types";

type Tab = "draw" | "type" | "upload";

const INKS = [
  { label: "Black", value: "#111827" },
  { label: "Blue", value: "#1d4ed8" },
];

/** Create a signature by drawing, typing or uploading a photo. The result
 *  is a trimmed transparent PNG; the last one can be remembered on this
 *  device for next time. */
export default function SignatureDialog({
  handwritingFont,
  onClose,
  onDone,
}: {
  handwritingFont: string; // CSS font-family for typed signatures
  onClose: () => void;
  onDone: (image: EditorImage) => void;
}) {
  const [tab, setTab] = useState<Tab>("draw");
  const [ink, setInk] = useState(INKS[0].value);
  const [remember, setRemember] = useState(true);
  // Only ever rendered after a click, so localStorage is safe to read here
  const [saved, setSaved] = useState<string | null>(() => loadSavedSignature());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draw tab
  const drawCanvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  const [drawn, setDrawn] = useState(false);

  // Type tab
  const [typed, setTyped] = useState("");

  // Upload tab — the processed (background-removed) canvas
  const [upload, setUpload] = useState<{ canvas: HTMLCanvasElement; preview: string } | null>(null);

  // Set up the drawing pad, sized for the screen's pixel density
  useEffect(() => {
    const canvas = drawCanvas.current;
    if (tab !== "draw" || !canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")!.scale(ratio, ratio);
    const p = new SignaturePad(canvas, { minWidth: 1, maxWidth: 3, penColor: ink });
    p.addEventListener("endStroke", () => setDrawn(!p.isEmpty()));
    pad.current = p;
    return () => {
      p.off();
      pad.current = null;
    };
    // Ink changes are applied below without resetting the drawing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (pad.current) pad.current.penColor = ink;
  }, [ink]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function renderTyped(): Promise<HTMLCanvasElement> {
    const size = 110;
    const font = `${size}px ${handwritingFont}`;
    await document.fonts.load(font, typed);
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(typed).width) + 80;
    c.height = Math.ceil(size * 1.8);
    ctx.font = font; // resizing a canvas resets its context state
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.fillText(typed, 40, c.height / 2);
    return c;
  }

  async function handleUploadFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const canvas = await fileToCanvas(file);
      removePaperBackground(canvas);
      setUpload({ canvas, preview: canvas.toDataURL("image/png") });
    } catch {
      setError("Couldn't read that image. Try a JPG or PNG photo.");
    } finally {
      setBusy(false);
    }
  }

  /** Finalise: trim, optionally remember, and hand back as an image. */
  async function finish(source: HTMLCanvasElement | null, rememberIt = remember) {
    const trimmed = source && trimTransparent(source);
    if (!trimmed) {
      setError("Nothing to use yet — add your signature first.");
      return;
    }
    setBusy(true);
    try {
      if (rememberIt) saveSignature(trimmed);
      onDone(await canvasToImage(trimmed, "png"));
    } finally {
      setBusy(false);
    }
  }

  async function useCurrent() {
    setError(null);
    if (tab === "draw") return finish(drawn ? drawCanvas.current : null);
    if (tab === "type") return finish(typed.trim() ? await renderTyped() : null);
    return finish(upload?.canvas ?? null);
  }

  const canUse = tab === "draw" ? drawn : tab === "type" ? !!typed.trim() : !!upload;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add signature"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-5 md:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Add signature</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-accent-soft/60 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Remembered signature — one tap to reuse */}
        {saved && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={saved} alt="Your saved signature" className="h-12 min-w-0 flex-1 object-contain object-left" />
            <button
              type="button"
              disabled={busy}
              onClick={async () => finish(await dataUrlToCanvas(saved), false)}
              className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
            >
              Use
            </button>
            <button
              type="button"
              onClick={() => {
                forgetSignature();
                setSaved(null);
              }}
              className="shrink-0 text-xs text-muted underline hover:text-foreground"
            >
              Forget
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-3 flex gap-1 rounded-lg bg-background p-1">
          {(["draw", "type", "upload"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setDrawn(false); // the pad starts blank when its tab mounts
                setError(null);
              }}
              className={`flex-1 rounded-md py-1.5 text-sm capitalize transition-colors ${
                tab === t ? "bg-card font-medium text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "draw" && (
          <div>
            <canvas
              ref={drawCanvas}
              className="h-44 w-full touch-none rounded-xl border border-dashed border-border bg-background"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-muted">Sign with your finger, pen or mouse</p>
              <button
                type="button"
                onClick={() => {
                  pad.current?.clear();
                  setDrawn(false);
                }}
                className="text-xs text-muted underline hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {tab === "type" && (
          <div>
            <input
              type="text"
              autoFocus
              placeholder="Type your name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft md:text-sm"
            />
            <div
              className="mt-3 flex h-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-background px-4 text-5xl"
              style={{ fontFamily: handwritingFont, color: ink }}
            >
              <span className="truncate">{typed || "Your name"}</span>
            </div>
          </div>
        )}

        {tab === "upload" && (
          <div>
            <label className="relative flex h-44 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-border bg-background text-sm text-muted hover:border-accent/40">
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUploadFile(file);
                  e.target.value = "";
                }}
              />
              {upload ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={upload.preview} alt="Uploaded signature" className="max-h-full max-w-full object-contain p-3" />
              ) : busy ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-accent/60" />
                  <span>Upload a photo of your signature</span>
                </>
              )}
            </label>
            <p className="mt-2 text-xs text-muted">
              Sign on white paper and take a clear photo — the paper is removed automatically.
            </p>
          </div>
        )}

        {/* Ink colour (not for uploads — those keep their own) */}
        {tab !== "upload" && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted">Ink</span>
            {INKS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                onClick={() => setInk(value)}
                className={`h-6 w-6 rounded-full border-2 ${ink === value ? "border-accent" : "border-transparent"}`}
              >
                <span className="block h-full w-full rounded-full" style={{ background: value }} />
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-accent"
            />
            Remember on this device
          </label>
          <button
            type="button"
            disabled={!canUse || busy}
            onClick={useCurrent}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Add to page
          </button>
        </div>
      </div>
    </div>
  );
}
