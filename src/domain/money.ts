/** Money helpers. Actual Budget stores amounts as integer cents. */

/** 12.3 -> 1230 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Parse a decimal amount as written in Polish bank exports: comma or dot as
 * the decimal separator, optional spaces as thousands separators
 * ("-1 234,56"). Throws on anything else instead of returning NaN.
 */
export function parseDecimalAmount(raw: string): number {
  const compact = raw.replace(/[\s ]/g, "").replace(/^\+/, "");
  if (!/^-?\d+([.,]\d+)?$/.test(compact)) {
    throw new Error(`invalid amount '${raw}'`);
  }
  return Number(compact.replace(",", "."));
}
