import type {
  ExistingTransaction,
  ImportResult,
  Ledger,
  LedgerAccount,
  NewTransaction,
  TransactionFilter,
} from "../ledger/ledger.js";

/** Everything the fake stores about a transaction. */
export interface StoredTransaction extends ExistingTransaction {
  payee: string | null;
  imported_payee: string | null;
  cleared: boolean;
}

/**
 * In-memory `Ledger` that models the parts of Actual Budget the importer
 * relies on:
 *
 * - `importTransactions` skips transactions whose `imported_id` already
 *   exists in the account;
 * - a transaction whose payee is a transfer payee becomes a transfer, and the
 *   other side is created in the target account (no imported_id, linked
 *   through `transfer_id`), like Actual does.
 *
 * Write calls are recorded in `writes` so tests can assert that a dry run
 * wrote nothing.
 */
export class InMemoryLedger implements Ledger {
  readonly accounts: LedgerAccount[] = [];
  readonly transactions: StoredTransaction[] = [];
  readonly writes: string[] = [];
  private nextId = 1;

  /** Create an account (and its transfer payee); returns the account id. */
  addAccount(name: string, id = `acct-${name.toLowerCase().replace(/\W+/g, "-")}`): string {
    this.accounts.push({ id, name });
    return id;
  }

  /** Put a transaction in the budget directly, as if it was already there. */
  seed(tx: Partial<StoredTransaction> & Pick<StoredTransaction, "account" | "date" | "amount">): StoredTransaction {
    const stored: StoredTransaction = {
      id: this.newId(),
      transfer_id: null,
      imported_id: null,
      notes: null,
      payee: null,
      imported_payee: null,
      cleared: false,
      ...tx,
    };
    this.transactions.push(stored);
    return stored;
  }

  /** Seed both sides of a transfer, as Actual would have created them. */
  seedTransfer(
    from: Pick<StoredTransaction, "account" | "date" | "amount"> & Partial<StoredTransaction>,
    toAccount: string
  ): [StoredTransaction, StoredTransaction] {
    const a = this.seed({ ...from, payee: transferPayeeId(toAccount) });
    const b = this.seed({
      account: toAccount,
      date: from.date,
      amount: -from.amount,
      payee: transferPayeeId(from.account),
    });
    a.transfer_id = b.id;
    b.transfer_id = a.id;
    return [a, b];
  }

  get(id: string): StoredTransaction | undefined {
    return this.transactions.find((t) => t.id === id);
  }

  inAccount(account: string): StoredTransaction[] {
    return this.transactions.filter((t) => t.account === account);
  }

  async getAccounts(): Promise<LedgerAccount[]> {
    return [...this.accounts];
  }

  async getTransferPayees(): Promise<Map<string, string>> {
    return new Map(this.accounts.map((a) => [a.id, transferPayeeId(a.id)]));
  }

  async findTransactions(f: TransactionFilter): Promise<ExistingTransaction[]> {
    return this.transactions
      .filter(
        (t) =>
          t.account === f.account &&
          (f.amount === undefined || t.amount === f.amount) &&
          (!f.dateFrom || t.date >= f.dateFrom) &&
          (!f.dateTo || t.date <= f.dateTo)
      )
      .map(toExisting);
  }

  async findByImportedIds(
    account: string,
    importedIds: string[]
  ): Promise<Map<string, string>> {
    const wanted = new Set(importedIds);
    return new Map(
      this.inAccount(account)
        .filter((t) => t.imported_id !== null && wanted.has(t.imported_id))
        .map((t) => [t.imported_id!, t.id])
    );
  }

  async importTransactions(
    account: string,
    transactions: NewTransaction[]
  ): Promise<ImportResult> {
    this.writes.push(`importTransactions(${account}, ${transactions.length})`);
    const result: ImportResult = { added: [], updated: [], errors: [] };
    for (const tx of transactions) {
      const exists = this.inAccount(account).some(
        (t) => tx.imported_id !== undefined && t.imported_id === tx.imported_id
      );
      if (exists) continue;

      const stored = this.seed({
        account,
        date: tx.date,
        amount: tx.amount,
        payee: tx.payee ?? (tx.payee_name ? `payee:${tx.payee_name}` : null),
        imported_payee: tx.imported_payee ?? null,
        notes: tx.notes ?? null,
        imported_id: tx.imported_id ?? null,
        cleared: tx.cleared ?? false,
      });
      result.added.push(stored.id);

      const target = transferTarget(tx.payee);
      if (target) {
        const mirror = this.seed({
          account: target,
          date: tx.date,
          amount: -tx.amount,
          payee: transferPayeeId(account),
          notes: tx.notes ?? null,
          transfer_id: stored.id,
        });
        stored.transfer_id = mirror.id;
      }
    }
    return result;
  }

  async updateTransaction(
    id: string,
    fields: Partial<NewTransaction> & { transfer_id?: string }
  ): Promise<void> {
    this.writes.push(`updateTransaction(${id})`);
    const tx = this.get(id);
    if (!tx) throw new Error(`No transaction ${id}`);
    Object.assign(tx, fields);
  }

  async linkTransfer(
    a: { id: string; account: string },
    b: { id: string; account: string }
  ): Promise<void> {
    this.writes.push(`linkTransfer(${a.id}, ${b.id})`);
    Object.assign(this.get(a.id)!, { payee: transferPayeeId(b.account), transfer_id: b.id });
    Object.assign(this.get(b.id)!, { payee: transferPayeeId(a.account), transfer_id: a.id });
  }

  private newId(): string {
    return `tx-${this.nextId++}`;
  }
}

export function transferPayeeId(accountId: string): string {
  return `transfer-payee:${accountId}`;
}

function transferTarget(payee: string | undefined): string | undefined {
  return payee?.startsWith("transfer-payee:")
    ? payee.slice("transfer-payee:".length)
    : undefined;
}

function toExisting(t: StoredTransaction): ExistingTransaction {
  return {
    id: t.id,
    account: t.account,
    date: t.date,
    amount: t.amount,
    transfer_id: t.transfer_id,
    imported_id: t.imported_id,
    notes: t.notes,
  };
}
