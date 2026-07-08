import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get in touch with PageDeck — questions, feedback or bug reports.",
};

/** X (Twitter) mark — not in our lucide version, so inlined. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
    </svg>
  );
}

const CONTACTS = [
  {
    label: "Email",
    value: "moseskwagga@gmail.com",
    href: "mailto:moseskwagga@gmail.com",
    Icon: Mail,
  },
  {
    label: "Phone",
    value: "+234 904 143 1717",
    href: "tel:+2349041431717",
    Icon: Phone,
  },
  {
    label: "X (Twitter)",
    value: "@moseskwagga",
    href: "https://x.com/moseskwagga",
    Icon: XIcon,
    external: true,
  },
];

export default function Support() {
  return (
    // Same backdrop treatment as the landing page so the two feel like
    // one surface.
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

      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-6 pt-14 text-center md:pt-20">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Support
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted md:text-base">
          Questions, feedback or a bug to report? Reach out through any of
          these channels.
        </p>

        <ul className="mt-8 w-full space-y-3 text-left md:mt-10">
          {CONTACTS.map(({ label, value, href, Icon, external }) => (
            <li key={label}>
              <a
                href={href}
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-accent/40 hover:bg-accent-soft/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted">{label}</span>
                  <span className="block truncate text-sm font-medium text-foreground">
                    {value}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
