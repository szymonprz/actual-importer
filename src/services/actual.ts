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
  payee_name?: string;
  imported_payee?: string;
  notes?: string;
  imported_id?: string;
  transfer_id?: string;
  cleared?: boolean;
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

export function amountToInteger(amount: number): number {
  return Math.round(amount * 100);
}
