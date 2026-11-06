import { mkdirSync } from "node:fs";
import * as api from "@actual-app/api";
import type { ConnectionConfig } from "../config/config.js";
import type {
  ExistingTransaction,
  ImportResult,
  Ledger,
  LedgerAccount,
  NewTransaction,
  TransactionFilter,
} from "./ledger.js";

const DATA_DIR = "/tmp/actual-importer-data";

export interface RemoteBudget {
  syncId: string;
  name: string;
  encrypted: boolean;
}

async function initServer(serverUrl: string, password: string): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  await api.init({ dataDir: DATA_DIR, serverURL: serverUrl, password });
}

/** Log in and list the budgets on the server. */
export async function listBudgets(
  serverUrl: string,
  password: string
): Promise<RemoteBudget[]> {
  await initServer(serverUrl, password);
  try {
    const files = await api.getBudgets();
    const bySyncId = new Map<string, RemoteBudget>();
    for (const f of files as Array<{ groupId?: string; name: string; encryptKeyId?: string | null }>) {
      if (!f.groupId || bySyncId.has(f.groupId)) continue;
      bySyncId.set(f.groupId, {
        syncId: f.groupId,
        name: f.name,
        encrypted: Boolean(f.encryptKeyId),
      });
    }
    return [...bySyncId.values()];
  } finally {
    await api.shutdown();
  }
}

/**
 * Open the configured budget, run `fn` against it, and always shut the API
 * down afterwards. `@actual-app/api` is a process-wide singleton, so only one
 * budget can be open at a time — don't nest calls.
 */
export async function withBudget<T>(
  conn: ConnectionConfig,
  fn: (ledger: Ledger) => Promise<T>
): Promise<T> {
  try {
    await initServer(conn.serverUrl, conn.password);
    await api.downloadBudget(conn.budgetId, { password: conn.e2ePassword });
    return await fn(new ActualLedger());
  } finally {
    await api.shutdown();
  }
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

/** `Ledger` backed by the `@actual-app/api` session opened by `withBudget`. */
export class ActualLedger implements Ledger {
  async getAccounts(): Promise<LedgerAccount[]> {
    const accounts = await api.getAccounts();
    return accounts.map((a) => ({ id: a.id, name: a.name }));
  }

  async getTransferPayees(): Promise<Map<string, string>> {
    const payees = await api.getPayees();
    const map = new Map<string, string>();
    for (const p of payees) {
      if (p.transfer_acct) map.set(p.transfer_acct, p.id);
    }
    return map;
  }

  async findTransactions(
    filter: TransactionFilter
  ): Promise<ExistingTransaction[]> {
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

  async findByImportedIds(
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

  async importTransactions(
    account: string,
    transactions: NewTransaction[]
  ): Promise<ImportResult> {
    const withAccount = transactions.map((t) => ({ ...t, account }));
    const result = await api.importTransactions(account, withAccount);
    return {
      added: result.added ?? [],
      updated: result.updated ?? [],
      errors: result.errors ?? [],
    };
  }

  async updateTransaction(
    id: string,
    fields: Partial<NewTransaction>
  ): Promise<void> {
    await api.updateTransaction(id, fields);
  }

  /**
   * Mirrors what Actual's UI does: each side gets the other account's
   * transfer payee and the other transaction's id. Actual syncs notes from
   * the side updated last, so `b`'s notes win.
   */
  async linkTransfer(
    a: { id: string; account: string },
    b: { id: string; account: string }
  ): Promise<void> {
    const transferPayees = await this.getTransferPayees();
    const payeeToB = transferPayees.get(b.account);
    const payeeToA = transferPayees.get(a.account);
    if (!payeeToA || !payeeToB) {
      throw new Error("Missing transfer payee for one of the accounts");
    }
    await api.updateTransaction(a.id, { payee: payeeToB, transfer_id: b.id });
    await api.updateTransaction(b.id, { payee: payeeToA, transfer_id: a.id });
  }
}
