import { normalizeAccountNumber, sameAccount } from "../domain/account-number.js";

/** A bank account number that corresponds to an Actual account. */
export interface AccountMapping {
  bankAccountNumber: string;
  actualAccountId: string;
  bank?: string;
}

/**
 * Mappings with `mapping` added, replacing any existing mapping for the same
 * bank account. The account number is stored normalized.
 */
export function withMapping(
  mappings: AccountMapping[],
  mapping: AccountMapping
): AccountMapping[] {
  const normalized = {
    ...mapping,
    bankAccountNumber: normalizeAccountNumber(mapping.bankAccountNumber),
  };
  return [
    ...mappings.filter((m) => !sameAccount(m.bankAccountNumber, mapping.bankAccountNumber)),
    normalized,
  ];
}

/** Mappings without the one for `bankAccountNumber`. */
export function withoutMapping(
  mappings: AccountMapping[],
  bankAccountNumber: string
): AccountMapping[] {
  return mappings.filter((m) => !sameAccount(m.bankAccountNumber, bankAccountNumber));
}

