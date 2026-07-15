// Shared category-name lookup for the v2 taxonomy defined in classifier.ts.
// Used by run-classify.ts, run-synthesize.ts, and the Next.js UI so the
// three don't drift out of sync with each other.

export const CATEGORY_NAMES: Record<number, string> = {
  1: "People & org moves",
  2: "Partnership & alliance",
  3: "Product/platform launch",
  4: "Capital events",
  5: "Workforce reductions",
  6: "Standards/protocols/OSS",
  7: "Customer/market signals",
  8: "Regulatory/policy/safety",
  9: "Executive voice",
  10: "Dev ecosystem health",
};
