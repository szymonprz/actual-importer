/**
 * Decide what to do with each transaction of a statement — without writing
 * anything. `executePlan` (./execute.ts) carries the plan out; a dry run
 * just reports it.
 */
import type { AccountMapping } from "../config/config.js";
import { shiftDate } from "../domain/dates.js";
import { toCents } from "../domain/money.js";
import type { Transaction } from "../domain/transaction.js";
import type {
  ExistingTransaction,
  Ledger,
  NewTransaction,
} from "../ledger/ledger.js";
import { computeImportedIds } from "./deduplication.js";
import { detectTransfer } from "./transfer-detector.js";
import {
  pickAutoCreated,
  pickCounterpart,
  TRANSFER_DATE_WINDOW_DAYS,
} from "./transfer-matcher.js";

export type PlannedAction =
  /** Already imported earlier (same imported_id in the account). */
  | { kind: "duplicate" }
  /** A regular transaction. */
  | { kind: "create" }
  /** A new transfer; Actual creates the other side in `target`. */
  | { kind: "transfer"; target: string }
  /** The other side already exists in `target`; import this side and link them. */
  | { kind: "link"; target: string; counterpart: ExistingTransaction }
  /**
   * This side was already created by Actual as the mirror of a transfer
   * imported from the other bank; mark it as imported instead of adding it.
   */
  | { kind: "adopt"; target: string; existing: ExistingTransaction };

export interface PlannedTransaction {
  source: Transaction;
  importedId: string;
  /** Integer cents. */
  amount: number;
  action: PlannedAction;
  /** What gets sent to `Ledger.importTransactions`. */
  payload: NewTransaction;
}

export interface ImportPlan {
  accountId: string;
  items: PlannedTransaction[];
}

export interface PlanInput {
  transactions: Transaction[];
  /** Actual account the statement belongs to. */
  accountId: string;
  /** Bank account number of the statement, as mapped (feeds imported_id). */
  bankAccountNumber: string;
  mappings: AccountMapping[];
}

export async function planImport(
  input: PlanInput,
  ledger: Ledger
): Promise<ImportPlan> {
  const { accountId } = input;
  const accountIds = new Set((await ledger.getAccounts()).map((a) => a.id));
  const transferPayees = await ledger.getTransferPayees();

  const importedIds = computeImportedIds(
    input.transactions,
    input.bankAccountNumber
  );
  const alreadyImported = await ledger.findByImportedIds(accountId, importedIds);
  // Existing transactions already matched to an earlier line of this statement.
  const claimed = new Set<string>();

  const window = (date: string) => ({
    dateFrom: shiftDate(date, -TRANSFER_DATE_WINDOW_DAYS),
    dateTo: shiftDate(date, TRANSFER_DATE_WINDOW_DAYS),
  });

  const items: PlannedTransaction[] = [];
  for (const [i, source] of input.transactions.entries()) {
    const importedId = importedIds[i];
    const amount = toCents(source.amount);
    const payload: NewTransaction = {
      date: source.date,
      amount,
      imported_payee: source.payee || undefined,
      notes: source.description || undefined,
      imported_id: importedId,
      cleared: true,
    };
    const isNew = !alreadyImported.has(importedId);
    const target = detectTransfer(source, input.mappings).targetActualAccountId;
    const item = (action: PlannedAction): PlannedTransaction => ({
      source,
      importedId,
      amount,
      action,
      payload,
    });

    if (!target || target === accountId) {
      payload.payee_name = source.payee || undefined;
      items.push(item(isNew ? { kind: "create" } : { kind: "duplicate" }));
      continue;
    }

    if (!isNew) {
      payload.payee = transferPayees.get(target);
      items.push(item({ kind: "duplicate" }));
      continue;
    }

    const existing = pickAutoCreated(
      await ledger.findTransactions({ account: accountId, amount, ...window(source.date) }),
      claimed,
      accountIds
    );
    if (existing) {
      claimed.add(existing.id);
      items.push(item({ kind: "adopt", target, existing }));
      continue;
    }

    const counterpart = pickCounterpart(
      { date: source.date, amount },
      await ledger.findTransactions({ account: target, amount: -amount, ...window(source.date) }),
      claimed,
      accountIds
    );
    if (counterpart) {
      // Imported without a payee, then linked to the counterpart.
      claimed.add(counterpart.id);
      items.push(item({ kind: "link", target, counterpart }));
      continue;
    }

    payload.payee = transferPayees.get(target);
    items.push(item({ kind: "transfer", target }));
  }

  return { accountId, items };
}
