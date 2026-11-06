/**
 * The budget the importer writes to, as seen by the import logic.
 *
 * `ActualLedger` (./actual.ts) talks to a real Actual Budget server;
 * `InMemoryLedger` (src/test-support) is a fake with the same transfer
 * semantics, for tests. Import logic depends only on this interface.
 */

export interface LedgerAccount {
  id: string;
  name: string;
}

/** A transaction to create. Amounts are integer cents. */
export interface NewTransaction {
  date: string;
  amount: number;
  /** Payee id. Use the target account's transfer payee to create a transfer. */
  payee?: string;
  /** Payee name; Actual creates or reuses a payee with this name. */
  payee_name?: string;
  imported_payee?: string;
  notes?: string;
  imported_id?: string;
  cleared?: boolean;
}

/** A transaction already in the budget. */
export interface ExistingTransaction {
  id: string;
  account: string;
  date: string;
  amount: number; // integer cents
  /** Id of the other side of a transfer (a transaction id), or null. */
  transfer_id: string | null;
  imported_id: string | null;
  notes: string | null;
}

export interface TransactionFilter {
  account: string;
  amount?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface ImportResult {
  /** Ids of transactions that were created. */
  added: string[];
  updated: string[];
  errors: Array<{ message: string }>;
}

export interface Ledger {
  getAccounts(): Promise<LedgerAccount[]>;
  /** Map of account id -> id of the payee that represents a transfer to that account. */
  getTransferPayees(): Promise<Map<string, string>>;
  findTransactions(filter: TransactionFilter): Promise<ExistingTransaction[]>;
  /** imported_id -> transaction id, for the given ids that exist in `account`. */
  findByImportedIds(
    account: string,
    importedIds: string[]
  ): Promise<Map<string, string>>;
  /**
   * Add transactions, skipping ones whose imported_id already exists.
   * A transaction whose payee is a transfer payee becomes a transfer, and the
   * ledger creates the other side in the target account.
   */
  importTransactions(
    account: string,
    transactions: NewTransaction[]
  ): Promise<ImportResult>;
  updateTransaction(id: string, fields: Partial<NewTransaction>): Promise<void>;
  /** Link two existing transactions in different accounts as a transfer pair. */
  linkTransfer(
    a: { id: string; account: string },
    b: { id: string; account: string }
  ): Promise<void>;
}
