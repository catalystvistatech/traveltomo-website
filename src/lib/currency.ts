// Display-only currency localization for PHP-billed prices.
//
// Promotion tiers are charged in PHP (via Xendit). To make the dashboard feel
// local we show an approximate amount in the viewer's own currency next to the
// real PHP price. Detection is best-effort from the browser locale; anything
// we can't map falls back to PHP (so the viewer just sees the billed price).

// Minimal ISO region -> ISO 4217 currency map covering major markets and the
// top inbound-tourist sources. Unmapped regions fall back to PHP.
const REGION_CURRENCY: Record<string, string> = {
  PH: "PHP",
  US: "USD",
  GB: "GBP",
  AU: "AUD",
  CA: "CAD",
  NZ: "NZD",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  SG: "SGD",
  MY: "MYR",
  TH: "THB",
  ID: "IDR",
  VN: "VND",
  IN: "INR",
  AE: "AED",
  SA: "SAR",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  // Eurozone
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  IE: "EUR",
  PT: "EUR",
  AT: "EUR",
  BE: "EUR",
  FI: "EUR",
  GR: "EUR",
};

// Currencies that conventionally show no decimal places.
const ZERO_DECIMAL = new Set(["JPY", "KRW", "IDR", "VND", "CLP", "HUF"]);

/** Best-effort detection of the viewer's currency from their browser locale. */
export function detectUserCurrency(): string {
  if (typeof navigator === "undefined") return "PHP";
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return (region && REGION_CURRENCY[region]) || "PHP";
  } catch {
    return "PHP";
  }
}

/** Formats an amount in the given ISO currency using the viewer's locale. */
export function formatMoney(amount: number, currency: string): string {
  const zero = ZERO_DECIMAL.has(currency);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: zero ? 0 : 2,
    maximumFractionDigits: zero ? 0 : 2,
  }).format(amount);
}
