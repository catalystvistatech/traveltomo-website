/**
 * Mock Xendit integration.
 *
 * In production we'd replace the bodies of `createInvoice`, `getInvoice`,
 * `verifyWebhook` with real calls against the Xendit REST API (and swap
 * `XENDIT_MODE = 'live'`). For now we emulate the pieces the rest of the
 * app needs so we can wire the full subscription flow end-to-end without
 * an external dependency.
 *
 * The mock uses only deterministic, process-local state (no network),
 * which keeps it safe for CI and local dev.
 */

export type XenditCurrency = "PHP" | "IDR" | "THB" | "MYR" | "SGD" | "USD";

export type CreateInvoiceInput = {
  externalId: string;
  amount: number;
  currency: XenditCurrency;
  description: string;
  payerEmail?: string;
  successRedirectUrl?: string;
  failureRedirectUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type XenditInvoice = {
  id: string;
  external_id: string;
  amount: number;
  currency: XenditCurrency;
  status: "PENDING" | "PAID" | "EXPIRED" | "FAILED";
  invoice_url: string;
  description: string;
  created_at: string;
  expires_at: string;
  provider: "xendit-mock";
};

const XENDIT_MODE = process.env.XENDIT_MODE ?? "mock";

/**
 * Creates a mocked Xendit invoice. The returned `invoice_url` points at the
 * app's internal mock checkout page so testers can click through.
 */
export async function createInvoice(
  input: CreateInvoiceInput
): Promise<XenditInvoice> {
  if (XENDIT_MODE !== "mock") {
    throw new Error(
      "Live Xendit is not configured yet. Set XENDIT_MODE=mock or wire the real SDK."
    );
  }

  const id = `xnd_mock_${cryptoRandom(24)}`;
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000); // 30 min

  return {
    id,
    external_id: input.externalId,
    amount: input.amount,
    currency: input.currency,
    status: "PENDING",
    invoice_url: buildCheckoutUrl(id, input),
    description: input.description,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    provider: "xendit-mock",
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getInvoice(invoiceId: string): Promise<XenditInvoice | null> {
  // The mock never actually persists invoices; callers should treat a
  // successful `startSubscription` as already-paid for dev. Real
  // implementation would call `GET /v2/invoices/{id}`.
  return null;
}

export function isMockMode() {
  return XENDIT_MODE === "mock";
}

// ---------------------------------------------------------------------------

function buildCheckoutUrl(invoiceId: string, input: CreateInvoiceInput) {
  const params = new URLSearchParams({
    id: invoiceId,
    external_id: input.externalId,
    amount: String(input.amount),
    currency: input.currency,
  });
  if (input.successRedirectUrl) {
    params.set("success_redirect_url", input.successRedirectUrl);
  }
  return `/admin/mock-checkout?${params.toString()}`;
}

function cryptoRandom(length: number) {
  const bytes = new Uint8Array(length);
  // crypto is available in the Node runtime used by Next server actions.
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}
