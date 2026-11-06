import type { Transaction } from "../domain/transaction.js";
import type { AccountMapping } from "../config/config.js";
import { findMapping } from "./account-mapping.js";

export interface TransferResult {
  isTransfer: boolean;
  targetActualAccountId?: string;
}

/** A transaction is a transfer when its counterparty is one of the user's mapped accounts. */
export function detectTransfer(
  transaction: Transaction,
  accountMappings: AccountMapping[]
): TransferResult {
  const match = transaction.counterpartyAccount
    ? findMapping(transaction.counterpartyAccount, accountMappings)
    : undefined;
  return match
    ? { isTransfer: true, targetActualAccountId: match.actualAccountId }
    : { isTransfer: false };
}
