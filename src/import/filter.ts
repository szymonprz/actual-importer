import type { Transaction } from "../domain/transaction.js";

export interface DateRange {
  /** Inclusive, YYYY-MM-DD. */
  from?: string;
  /** Inclusive, YYYY-MM-DD. */
  to?: string;
}

export function filterByDate(
  transactions: Transaction[],
  { from, to }: DateRange
): Transaction[] {
  return transactions.filter(
    (tx) => (!from || tx.date >= from) && (!to || tx.date <= to)
  );
}
