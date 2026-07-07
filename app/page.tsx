"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Coins, ExternalLink, Menu, X } from "lucide-react";

const GITHUB_URL = "https://github.com/reelmza/pagedeck";

/** Product landing page: nav + hero + product screenshot. */
export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    // One-viewport page: hero = screen minus nav, the screenshot crops
    // at the bottom edge — nothing scrolls.
    <main className="flex h-dvh flex-col overflow-hidden">
      {/* ---------------- Nav ---------------- */}
      <header className="relative shrink-0 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/app-assets/PageDeck_Logo_NoBG.svg"
              alt="PageDeck"
              className="h-6 w-auto"
            />
          </Link>

          {/* Center links — desktop only */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 md:flex">
            <Link
              href="/"
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Home
            </Link>
            <Link
              href="/pdf-organize"
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              PDF Organizer
            </Link>
            {/* Not built yet — hover reveals a tooltip instead of navigating */}
            <span className="group relative cursor-default text-sm text-muted">
              PDF Editor
              <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                Coming soon
              </span>
            </span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
            >
              Contribute <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </nav>

          {/* Donate pill — desktop only */}
          <Link
            href="#"
            className="hidden rounded-full bg-transparent border px-4 py-1.5 text-sm font-normal text-accent transition-colors hover:bg-accent/90 hover:text-white md:flex items-center gap-2"
          >
            <span>Leave a Tip</span>
            <Coins size={20} strokeWidth={1.5} />
          </Link>

          {/* Hamburger — mobile only */}
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md p-1.5 text-foreground hover:bg-accent-soft/60 md:hidden"
          >
            {menuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-border px-4 py-3 md:hidden">
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-muted hover:bg-accent-soft/60 hover:text-foreground"
            >
              Home
            </Link>
            <Link
              href="/pdf-organize"
              onClick={() => setMenuOpen(false)}
              className="rounded-md px-2 py-2 text-sm text-muted hover:bg-accent-soft/60 hover:text-foreground"
            >
              PDF Organizer
            </Link>
            {/* No hover on touch — a small badge marks it as unreleased */}
            <span className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted/70">
              PDF Editor
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent">
                Coming soon
              </span>
            </span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm text-muted hover:bg-accent-soft/60 hover:text-foreground"
            >
              Contribute <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Link
              href="#"
              onClick={() => setMenuOpen(false)}
              className="mt-1 rounded-full bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent/90"
            >
              <span>Leave a Tip</span>
              <Coins size={20} strokeWidth={2} />
            </Link>
          </nav>
        )}
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="flex min-h-0 flex-1 flex-col items-center px-6 pt-10 text-center md:pt-14">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Re-order and Edit PDF from your browser.
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted md:max-w-lg md:text-base">
          Reorder, merge and organize PDF pages — right in your browser. Your
          files never leave your device.
        </p>

        <Link
          href="/pdf-organize"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          Organize PDF Files <ArrowRight className="h-4 w-4" />
        </Link>

        {/* Product screenshot — fills the space left under the CTA and is
            cropped at the bottom screen edge. Full-bleed on mobile (wider
            than the px-6 section, so it reaches the real screen edge). */}
        <div className="mt-8 min-h-0 w-[calc(100%+3rem)] flex-1 overflow-hidden md:mt-10 md:w-full">
          {/* Desktop: central shot with the mobile screenshot overlaying
              its right side */}
          <div className="relative mx-auto hidden w-full max-w-4xl md:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/app-assets/hero-pc-image.png"
              alt="PageDeck organizer on desktop"
              className="w-full rounded-xl border border-border shadow-xl"
            />
          </div>
          {/* Mobile shot slides off the right edge for style */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/app-assets/hero-mobile-image.png"
            alt="PageDeck organizer on mobile"
            className="ml-auto w-[90%] translate-x-6 rounded-l-xl border border-border shadow-xl md:hidden"
          />
        </div>
      </section>
    </main>
  );
}
