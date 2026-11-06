import type { ExistingTransaction } from "../ledger/ledger.js";
import { daysBetween } from "../domain/dates.js";

export const TRANSFER_DATE_WINDOW_DAYS = 3;

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

/**
 * The statement's own side of a transfer may already exist in the source
 * account: Actual creates it automatically when the other bank's statement is
 * imported first. Such a transaction has no imported_id and is linked to a
 * transaction (not an account id) through `transfer_id`.
 */
export function pickAutoCreated(
  candidates: ExistingTransaction[],
  claimed: ReadonlySet<string>,
  accountIds: ReadonlySet<string>
): ExistingTransaction | undefined {
  return candidates.find(
    (t) =>
      t.imported_id === null &&
      t.transfer_id !== null &&
      !accountIds.has(t.transfer_id) &&
      !claimed.has(t.id)
  );
}
