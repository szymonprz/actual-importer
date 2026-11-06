/**
 * Bank account numbers. Everything that compares or stores account numbers
 * goes through `normalizeAccountNumber`, so "PL10 1050 …", "'10 1050 …" and
 * "101050…" are the same account.
 */

/** Canonical form: no whitespace, apostrophes or `PL` country prefix. */
export function normalizeAccountNumber(raw: string): string {
  return raw.replace(/[\s']/g, "").replace(/^PL/i, "");
}

export function sameAccount(a: string, b: string): boolean {
  return normalizeAccountNumber(a) === normalizeAccountNumber(b);
}

/** Polish NRB: 26 digits. Card terminals and other references don't match. */
export function isNrb(accountNumber: string): boolean {
  return /^\d{26}$/.test(normalizeAccountNumber(accountNumber));
}

/** 26 digits -> "10 1050 1461 1000 0097 0488 6994"; anything else unchanged. */
export function formatAccountNumber(accountNumber: string): string {
  const n = normalizeAccountNumber(accountNumber);
  return isNrb(n)
    ? `${n.slice(0, 2)} ${n.slice(2).replace(/(\d{4})(?=\d)/g, "$1 ")}`
    : accountNumber;
}
