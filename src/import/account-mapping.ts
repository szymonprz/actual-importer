import type { Transaction } from "../domain/transaction.js";
import type { AccountMapping } from "../config/config.js";
import {
  isNrb,
  normalizeAccountNumber,
  sameAccount,
} from "../domain/account-number.js";

export interface CounterpartyCandidate {
  accountNumber: string;
  payee: string;
  count: number;
}

export function findMapping(
  accountNumber: string,
  mappings: AccountMapping[]
): AccountMapping | undefined {
  return mappings.find((m) => sameAccount(m.bankAccountNumber, accountNumber));
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
    if (!isNrb(account) || skip.has(account)) continue;
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
