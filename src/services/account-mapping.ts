import type { Transaction } from "../parsers/types.js";
import {
  normalizeAccountNumber,
  type AccountMapping,
} from "../config/config.js";

export interface CounterpartyCandidate {
  accountNumber: string;
  payee: string;
  count: number;
}

// Polish NRB: 26 digits. Card terminals and other references don't match this.
const NRB = /^\d{26}$/;

export function findMapping(
  accountNumber: string,
  mappings: AccountMapping[]
): AccountMapping | undefined {
  const normalized = normalizeAccountNumber(accountNumber);
  return mappings.find(
    (m) => normalizeAccountNumber(m.bankAccountNumber) === normalized
  );
}

/**
 * Counterparty bank accounts in this CSV that aren't mapped or ignored yet,
 * most frequent first. Any of them might be another of the user's own
 * accounts (spouse, joint account, savings) that should become a transfer.
 */
export function findUnmappedCounterparties(
  transactions: Transaction[],
  sourceAccountNumber: string,
  mappings: AccountMapping[],
  ignored: string[],
  minCount = 1
): CounterpartyCandidate[] {
  const skip = new Set(
    [sourceAccountNumber, ...ignored].map(normalizeAccountNumber)
  );
  const byAccount = new Map<string, CounterpartyCandidate>();

  for (const tx of transactions) {
    if (!tx.counterpartyAccount) continue;
    const account = normalizeAccountNumber(tx.counterpartyAccount);
    if (!NRB.test(account) || skip.has(account)) continue;
    if (findMapping(account, mappings)) continue;

    const entry = byAccount.get(account) ?? {
      accountNumber: account,
      payee: tx.payee,
      count: 0,
    };
    entry.count++;
    byAccount.set(account, entry);
  }

  return [...byAccount.values()]
    .filter((c) => c.count >= minCount)
    .sort((a, b) => b.count - a.count);
}

export function formatAccountNumber(n: string): string {
  // 26 digits -> "10 1050 1461 1000 0097 0488 6994"
  return n.length === 26
    ? `${n.slice(0, 2)} ${n.slice(2).replace(/(\d{4})(?=\d)/g, "$1 ")}`
    : n;
}
