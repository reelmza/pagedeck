import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Nav from "@/components/Nav";

/** Product landing page: nav + hero + product screenshot. */
export default function Home() {
  return (
    // One-viewport page: hero = screen minus nav, the screenshot crops
    // at the bottom edge — nothing scrolls.
    // bg-card = white: one uniform surface for nav + hero
    <main className="relative isolate flex h-dvh flex-col overflow-hidden bg-card">
      {/* Hero image preloads — React hoists these into <head>, so the
          download starts before the hero markup is even parsed. The media
          queries make each device preload only its own image. */}
      <link
        rel="preload"
        as="image"
        href="/images/app-assets/hero-pc-image.webp"
        media="(min-width: 768px)"
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        href="/images/app-assets/hero-mobile-image.webp"
        media="(max-width: 767px)"
        fetchPriority="high"
      />

      {/* Backdrop: accent glow under a fading dot grid — spans the whole
          page, so it also shows through the transparent nav */}
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute inset-0 -z-10"
      />
      <div
        aria-hidden
        className="hero-dots pointer-events-none absolute inset-0 -z-10"
      />

      <Nav />

      {/* ---------------- Hero ---------------- */}
      <section className="flex min-h-0 flex-1 flex-col items-center px-6 pt-10 text-center md:pt-14">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Re-order and Edit PDFs from your browser.
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
          {/* One <picture>: the browser downloads only the matching source
              (phones no longer fetch the desktop shot and vice versa).
              Mobile slides off the right edge; md+ is centered. */}
          <div className="relative mx-auto w-full md:max-w-4xl">
            <picture>
              <source
                media="(min-width: 768px)"
                srcSet="/images/app-assets/hero-pc-image.webp"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/app-assets/hero-mobile-image.webp"
                alt="PageDeck organizer"
                fetchPriority="high"
                className="ml-auto w-[90%] translate-x-6 rounded-l-xl border border-border shadow-xl md:mx-auto md:w-full md:translate-x-0 md:rounded-xl"
              />
            </picture>
          </div>
        </div>
      </section>
    </main>
  );
}
