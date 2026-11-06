import { createHash } from "node:crypto";

export function computeImportedId(
  date: string,
  amount: number,
  description: string,
  bankAccountNumber: string,
  occurrence = 1
): string {
  const base = `${date}|${amount}|${description}|${bankAccountNumber}`;
  // The first occurrence keeps the original formula so IDs of everything
  // already imported stay the same.
  const input = occurrence === 1 ? base : `${base}|${occurrence}`;
  return createHash("sha256").update(input).digest("hex");
}

/**
 * IDs for a whole statement. Identical transactions on the same day (e.g. two
 * 1000 zł ATM withdrawals) would otherwise share an ID and be merged; the
 * 2nd, 3rd… copy gets an occurrence suffix instead.
 */
export function computeImportedIds(
  transactions: Array<{ date: string; amount: number; description: string }>,
  bankAccountNumber: string
): string[] {
  const seen = new Map<string, number>();
  return transactions.map((tx) => {
    const key = `${tx.date}|${tx.amount}|${tx.description}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return computeImportedId(
      tx.date,
      tx.amount,
      tx.description,
      bankAccountNumber,
      occurrence
    );
  });
}
