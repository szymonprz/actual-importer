import type { Transaction } from "../parsers/types.js";
import type { AccountMapping } from "../config/config.js";

export interface TransferResult {
  isTransfer: boolean;
  targetActualAccountId?: string;
}

export function detectTransfer(
  transaction: Transaction,
  accountMappings: AccountMapping[]
): TransferResult {
  if (!transaction.counterpartyAccount) {
    return { isTransfer: false };
  }

  const normalizedCounterparty = transaction.counterpartyAccount.replace(
    /\s/g,
    ""
  );

  const match = accountMappings.find(
    (m) => m.bankAccountNumber.replace(/\s/g, "") === normalizedCounterparty
  );

  if (match) {
    return { isTransfer: true, targetActualAccountId: match.actualAccountId };
  }

  return { isTransfer: false };
}
