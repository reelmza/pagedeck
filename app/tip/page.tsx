import type { Metadata } from "next";
import Nav from "@/components/Nav";
import TipForm from "@/components/TipForm";

export const metadata: Metadata = {
  title: "Leave a Tip",
  description:
    "Support PageDeck — tips keep it free, offline and ad-free for everyone.",
};

export default function Tip() {
  return (
    // Same backdrop treatment as the landing and support pages
    <main className="relative isolate flex min-h-dvh flex-col bg-card">
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute inset-0 -z-10"
      />
      <div
        aria-hidden
        className="hero-dots pointer-events-none absolute inset-0 -z-10"
      />

      <Nav />

      <section className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 pb-14 pt-14 text-center md:pt-20">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Leave a Tip
        </h1>
        <p className="mt-3 max-w-sm text-sm text-muted md:text-base">
          PageDeck is free and runs entirely in your browser. If it saved you
          some time, a tip helps keep it that way.
        </p>

        <div className="mt-8 w-full md:mt-10">
          <TipForm />
        </div>
      </section>
    </main>
  );
}
