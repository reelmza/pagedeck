"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

/** Paystack mark, inlined with currentColor so it always matches the
 *  surrounding text color (accent at rest, white on hover / solid pill). */
function PaystackIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44.6 44.3"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M39.9,0H2.3C1.1,0,0,1.1,0,2.4v4.2C0,7.9,1.1,9,2.3,9h37.6c1.3,0,2.3-1.1,2.4-2.4V2.4C42.3,1.1,41.2,0,39.9,0L39.9,0z M39.9,23.6H2.3c-0.6,0-1.2,0.3-1.7,0.7C0.2,24.7,0,25.3,0,26v4.2c0,1.3,1.1,2.4,2.3,2.4h37.6c1.3,0,2.3-1,2.4-2.4V26C42.3,24.6,41.2,23.6,39.9,23.6L39.9,23.6z M23.5,35.4H2.3c-0.6,0-1.2,0.2-1.6,0.7c-0.4,0.4-0.7,1-0.7,1.7V42c0,1.3,1.1,2.4,2.3,2.4h21.1c1.3,0,2.3-1.1,2.3-2.4v-4.3C25.8,36.4,24.8,35.4,23.5,35.4L23.5,35.4z M42.3,11.8h-40c-0.6,0-1.2,0.2-1.6,0.7c-0.4,0.4-0.7,1-0.7,1.7v4.2c0,1.3,1.1,2.4,2.3,2.4h39.9c1.3,0,2.3-1.1,2.3-2.4v-4.2C44.6,12.9,43.6,11.8,42.3,11.8L42.3,11.8z" />
    </svg>
  );
}

/** Top navigation — used on the landing and support pages only
 *  (the organizer keeps its full-screen app layout). */
export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="relative shrink-0">
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
          <Link
            href="/pdf-compress"
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            PDF Compressor
          </Link>

          {/* Not built yet — hover reveals a tooltip instead of navigating */}
          <span className="group relative cursor-default text-sm text-muted">
            PDF Editor
            <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              Coming soon
            </span>
          </span>

          <Link
            href="/support"
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Support
          </Link>
        </nav>

        {/* Donate pill — desktop only */}
        <Link
          href="https://paystack.shop/pay/pagedeck"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-2 rounded-full border bg-transparent px-4 py-1.5 text-sm font-normal text-accent transition-colors hover:bg-accent/90 hover:text-white md:flex"
        >
          <span>Leave a Tip</span>
          <PaystackIcon className="h-4 w-4" />
        </Link>

        {/* Hamburger — mobile only */}
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-md p-1.5 text-foreground hover:bg-accent-soft/60 md:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-border bg-card px-4 py-3 md:hidden">
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
          <Link
            href="/pdf-compress"
            onClick={() => setMenuOpen(false)}
            className="rounded-md px-2 py-2 text-sm text-muted hover:bg-accent-soft/60 hover:text-foreground"
          >
            PDF Compressor
          </Link>
          {/* No hover on touch — a small badge marks it as unreleased */}
          <span className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted/70">
            PDF Editor
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent">
              Coming soon
            </span>
          </span>
          <Link
            href="/support"
            onClick={() => setMenuOpen(false)}
            className="rounded-md px-2 py-2 text-sm text-muted hover:bg-accent-soft/60 hover:text-foreground"
          >
            Support
          </Link>
          <Link
            href="https://paystack.shop/pay/pagedeck"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="mt-1 flex items-center justify-center gap-2 rounded-full border bg-transparent px-4 py-2 text-sm font-normal text-accent transition-colors hover:bg-accent/90 hover:text-white"
          >
            <span>Leave a Tip</span>
            <PaystackIcon className="h-4 w-4" />
          </Link>
        </nav>
      )}
    </header>
  );
}
