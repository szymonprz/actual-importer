import * as p from "@clack/prompts";
import {
  saveMappings,
  type AccountMapping,
  type Config,
} from "../config/config.js";
import type { LedgerAccount } from "../ledger/ledger.js";
import type { CounterpartyCandidate } from "../services/account-mapping.js";
import {
  formatAccountNumber,
  normalizeAccountNumber,
} from "../domain/account-number.js";

export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function pickAccount(
  message: string,
  accounts: LedgerAccount[]
): Promise<string | undefined> {
  const choice = await p.select({
    message,
    options: accounts.map((a) => ({ value: a.id, label: a.name })),
  });
  return p.isCancel(choice) ? undefined : choice;
}

/** Ask which Actual account the CSV's own account is, and save the answer. */
export async function promptSourceMapping(
  config: Config,
  accountNumber: string,
  bank: string,
  accounts: LedgerAccount[]
): Promise<AccountMapping | undefined> {
  const actualAccountId = await pickAccount(
    `Bank account ${formatAccountNumber(accountNumber)} (${bank}) isn't mapped yet. Which Actual account is it?`,
    accounts
  );
  if (!actualAccountId) return undefined;

  const mapping: AccountMapping = {
    bankAccountNumber: normalizeAccountNumber(accountNumber),
    actualAccountId,
    bank,
  };
  config.accountMappings.push(mapping);
  await saveMappings(config);
  p.log.success("Mapping saved.");
  return mapping;
}

/**
 * Offer unmapped counterparty accounts so the user can mark the ones that are
 * their own (spouse, joint, savings). Those become transfers. The rest are
 * remembered as ignored so we don't ask again.
 */
export async function promptCounterpartyMappings(
  config: Config,
  candidates: CounterpartyCandidate[],
  accounts: LedgerAccount[],
  limit = 10
): Promise<void> {
  const shown = candidates.slice(0, limit);
  if (shown.length === 0) return;

  const selected = await p.multiselect({
    message:
      "Are any of these accounts yours (tracked in Actual)? Selected ones become transfers; " +
      "unselected won't be asked about again. (space to select, enter to confirm)",
    options: shown.map((c) => ({
      value: c.accountNumber,
      label: `${formatAccountNumber(c.accountNumber)}  ${c.payee}`,
      hint: `${c.count}×`,
    })),
    required: false,
  });
  if (p.isCancel(selected)) return; // ask again next time

  const chosen = new Set(selected);
  for (const c of shown) {
    if (!chosen.has(c.accountNumber)) {
      (config.ignoredCounterparties ??= []).push(c.accountNumber);
      continue;
    }
    const actualAccountId = await pickAccount(
      `Which Actual account is ${formatAccountNumber(c.accountNumber)} (${c.payee})?`,
      accounts
    );
    if (actualAccountId) {
      config.accountMappings.push({
        bankAccountNumber: c.accountNumber,
        actualAccountId,
      });
    }
  }

  await saveMappings(config);
}
