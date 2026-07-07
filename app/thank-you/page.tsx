import Link from "next/link";
import { CircleCheck } from "lucide-react";

export const metadata = { title: "Thank You" };

/** Landing spot for Paystack's post-payment redirect. */
export default function ThankYouPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-card px-6 text-center">
      <CircleCheck
        className="h-14 w-14 text-green-600 md:h-16 md:w-16"
        strokeWidth={1.5}
      />
      <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        Thank you for your donation
      </h1>
      <p className="max-w-sm text-sm text-muted">
        Your support keeps PageDeck free, offline and ad-free for everyone. A
        copy of your receipt has been sent to your email address. <br />
        <br />
        <Link
          href="mailto:moseskwagga@gmail.com"
          className="underline hover:no-underline"
        >
          moseskwagga@gmail.com
        </Link>
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
      >
        Back to PageDeck
      </Link>
    </main>
  );
}
