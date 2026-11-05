import type { ExistingTransaction } from "./actual.js";

export const TRANSFER_DATE_WINDOW_DAYS = 3;

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A transaction in the target account can be the other side of a transfer if
 * it isn't linked to anything yet. A `transfer_id` that points at an account id
 * (written by older versions of this tool) counts as not linked.
 */
export function isUnlinked(
  tx: ExistingTransaction,
  accountIds: ReadonlySet<string>
): boolean {
  return tx.transfer_id === null || accountIds.has(tx.transfer_id);
}

/**
 * Pick the transaction in the target account that is the other side of a
 * transfer: opposite amount, within the date window, not linked yet and not
 * already claimed by another transfer in this import. Closest date wins.
 */
export function pickCounterpart(
  tx: { date: string; amount: number },
  candidates: ExistingTransaction[],
  claimed: ReadonlySet<string>,
  accountIds: ReadonlySet<string>,
  windowDays = TRANSFER_DATE_WINDOW_DAYS
): ExistingTransaction | undefined {
  return candidates
    .filter(
      (c) =>
        c.amount === -tx.amount &&
        !claimed.has(c.id) &&
        isUnlinked(c, accountIds) &&
        daysBetween(c.date, tx.date) <= windowDays
    )
    .sort(
      (x, y) => daysBetween(x.date, tx.date) - daysBetween(y.date, tx.date)
    )[0];
}
