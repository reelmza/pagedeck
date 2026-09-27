"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Lock } from "lucide-react";
import { MERCHANT_NAME } from "@/lib/site";

/** Preset tip amounts in Naira — shown in the dropdown. */
const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000];

/** Sentinel select value that reveals the manual amount input. */
const CUSTOM = "custom";

/** Smallest tip we accept (Paystack's NGN minimum is ₦50). */
const MIN_AMOUNT = 100;

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

/** Loose email check — Paystack does the real validation. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// text-base (16px) on mobile — anything smaller makes iOS zoom in on focus
const inputClass =
  "w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-base text-foreground md:text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent-soft";

/** Where the form is in the payment flow. */
type Status = "idle" | "paying" | "verifying";

/** Tip form — collects the payer's details and an amount (preset or
 *  typed), then opens Paystack's inline checkout on this page. */
export default function TipForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [choice, setChoice] = useState(String(PRESET_AMOUNTS[1]));
  const [customAmount, setCustomAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const isCustom = choice === CUSTOM;
  // Amount in whole Naira; NaN when the custom field is empty/invalid
  const amount = isCustom ? Number(customAmount) : Number(choice);
  const amountValid = Number.isFinite(amount) && amount >= MIN_AMOUNT;
  const busy = status !== "idle";

  /** The thank-you page confirms the payment server-side and shows
   *  the receipt — the button keeps spinning until it loads. */
  function showReceipt(reference: string) {
    setStatus("verifying");
    router.push(`/thank-you?reference=${encodeURIComponent(reference)}`);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) return setError("Please enter your name.");
    if (!EMAIL_RE.test(trimmedEmail))
      return setError("Please enter a valid email address.");
    if (!amountValid)
      return setError(`Please enter at least ${naira.format(MIN_AMOUNT)}.`);

    const key = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
    if (!key) return setError("Payments aren't set up yet — please try later.");

    setStatus("paying");
    try {
      // Loaded on demand — the library touches `window` at import time
      const { default: PaystackPop } = await import("@paystack/inline-js");
      const [firstName, ...rest] = trimmedName.split(/\s+/);

      new PaystackPop().newTransaction({
        key,
        email: trimmedEmail,
        amount: Math.round(amount * 100), // Naira → kobo
        currency: "NGN",
        firstName,
        lastName: rest.join(" ") || undefined,
        // custom_fields makes the name visible on the Paystack dashboard
        metadata: {
          custom_fields: [
            { display_name: "Name", variable_name: "name", value: trimmedName },
          ],
        },
        onSuccess: (tx) => showReceipt(tx.reference),
        onCancel: () => setStatus("idle"),
        onError: (err) => {
          setStatus("idle");
          setError(err.message || "Couldn't start the payment. Please try again.");
        },
      });
    } catch {
      setStatus("idle");
      setError("Couldn't load the payment form. Check your connection and try again.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="w-full space-y-5 text-left"
    >
      <div>
        <label htmlFor="tip-name" className="mb-1.5 block text-sm font-medium text-foreground">
          Your name
        </label>
        <input
          id="tip-name"
          type="text"
          autoComplete="name"
          placeholder="Jane Doe"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Required by Paystack — also where the receipt is sent */}
      <div>
        <label htmlFor="tip-email" className="mb-1.5 block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="tip-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted">For your payment receipt.</p>
      </div>

      <div>
        <label htmlFor="tip-amount" className="mb-1.5 block text-sm font-medium text-foreground">
          Amount
        </label>
        <select
          id="tip-amount"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={`${inputClass} cursor-pointer`}
        >
          {PRESET_AMOUNTS.map((a) => (
            <option key={a} value={a}>
              {naira.format(a)}
            </option>
          ))}
          <option value={CUSTOM}>Enter a custom amount…</option>
        </select>

        {/* Manual entry — only shown when "custom" is picked */}
        {isCustom && (
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-muted md:text-sm">
              ₦
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_AMOUNT}
              step={1}
              autoFocus
              aria-label="Custom amount in Naira"
              placeholder={String(MIN_AMOUNT)}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className={`${inputClass} pl-8`}
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-wait disabled:opacity-70"
      >
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {status === "verifying"
          ? "Confirming payment…"
          : status === "paying"
            ? "Opening checkout…"
            : amountValid
              ? `Tip ${naira.format(amount)}`
              : "Leave a Tip"}
      </button>

      {/* Paystack shows the account name, not PageDeck — say so up front */}
      <p className="flex items-start justify-center gap-1.5 text-center text-xs text-muted">
        <Lock className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          Secure payment via Paystack. You&apos;ll be paying{" "}
          <span className="font-medium text-foreground">{MERCHANT_NAME}</span>,
          which will also appear on your bank statement.
        </span>
      </p>
    </form>
  );
}
