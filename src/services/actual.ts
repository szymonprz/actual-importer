import { mkdirSync, existsSync } from "node:fs";
import * as api from "@actual-app/api";
import type { Config } from "../config/config.js";

const DATA_DIR = "/tmp/actual-importer-data";

export interface ActualAccount {
  id: string;
  name: string;
}

export interface ActualTransaction {
  date: string;
  amount: number; // integer cents
  payee?: string; // payee id — use the target account's transfer payee to create a transfer
  payee_name?: string;
  imported_payee?: string;
  notes?: string;
  imported_id?: string;
  cleared?: boolean;
}

export interface ExistingTransaction {
  id: string;
  account: string;
  date: string;
  amount: number; // integer cents
  transfer_id: string | null;
  imported_id: string | null;
  notes: string | null;
}

export interface ImportResult {
  added: string[];
  updated: string[];
  errors: Array<{ message: string }>;
}

export async function connect(config: Config): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  await api.init({
    dataDir: DATA_DIR,
    serverURL: config.serverUrl,
    password: config.password,
  });
  await api.downloadBudget(config.budgetId, {
    password: config.e2ePassword,
  });
}

export async function disconnect(): Promise<void> {
  await api.shutdown();
}

export async function getAccounts(): Promise<ActualAccount[]> {
  const accounts = await api.getAccounts();
  return accounts.map((a) => ({ id: a.id, name: a.name }));
}

export async function importTransactions(
  accountId: string,
  transactions: ActualTransaction[]
): Promise<ImportResult> {
  const withAccount = transactions.map((t) => ({ ...t, account: accountId }));
  const result = await api.importTransactions(accountId, withAccount);
  return {
    added: result.added ?? [],
    updated: result.updated ?? [],
    errors: result.errors ?? [],
  };
}

/** Map of account id -> id of the payee that represents a transfer to that account. */
export async function getTransferPayees(): Promise<Map<string, string>> {
  const payees = await api.getPayees();
  const map = new Map<string, string>();
  for (const p of payees) {
    if (p.transfer_acct) map.set(p.transfer_acct, p.id);
  }
  return map;
}

const TX_FIELDS = [
  "id",
  "account",
  "date",
  "amount",
  "transfer_id",
  "imported_id",
  "notes",
];

export async function findTransactions(filter: {
  account: string;
  amount?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ExistingTransaction[]> {
  const where: Record<string, unknown> = { account: filter.account };
  if (filter.amount !== undefined) where.amount = filter.amount;
  if (filter.dateFrom || filter.dateTo) {
    where.date = {
      ...(filter.dateFrom ? { $gte: filter.dateFrom } : {}),
      ...(filter.dateTo ? { $lte: filter.dateTo } : {}),
    };
  }
  const result = (await api.runQuery(
    api.q("transactions").filter(where).select(TX_FIELDS)
  )) as { data: ExistingTransaction[] };
  return result.data;
}

export async function findByImportedIds(
  account: string,
  importedIds: string[]
): Promise<Map<string, string>> {
  if (importedIds.length === 0) return new Map();
  const result = (await api.runQuery(
    api
      .q("transactions")
      .filter({ account, imported_id: { $oneof: importedIds } })
      .select(["id", "imported_id"])
  )) as { data: Array<{ id: string; imported_id: string }> };
  return new Map(result.data.map((t) => [t.imported_id, t.id]));
}

export async function updateTransaction(
  id: string,
  fields: Partial<ActualTransaction>
): Promise<void> {
  await api.updateTransaction(id, fields);
}

/**
 * Link two existing transactions in different accounts as a transfer pair.
 * Mirrors what Actual's UI does: each side gets the other account's transfer
 * payee and the other transaction's id. Actual syncs notes from the side
 * updated last, so `b`'s notes win.
 */
export async function linkTransfer(
  a: { id: string; account: string },
  b: { id: string; account: string },
  transferPayees: Map<string, string>
): Promise<void> {
  const payeeToB = transferPayees.get(b.account);
  const payeeToA = transferPayees.get(a.account);
  if (!payeeToA || !payeeToB) {
    throw new Error("Missing transfer payee for one of the accounts");
  }
  await api.updateTransaction(a.id, { payee: payeeToB, transfer_id: b.id });
  await api.updateTransaction(b.id, { payee: payeeToA, transfer_id: a.id });
}

export function amountToInteger(amount: number): number {
  return Math.round(amount * 100);
}
