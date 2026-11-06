/** A transaction as read from a bank statement, before it touches Actual. */
export interface Transaction {
  date: string; // YYYY-MM-DD
  amount: number; // in currency units; negative = expense, positive = income
  payee: string;
  description: string;
  /** The other party's account number, when the bank provides it. Enables transfer detection. */
  counterpartyAccount?: string;
}

/** A parsed bank statement: whose account it is and what happened on it. */
export interface Statement {
  sourceAccountNumber: string;
  transactions: Transaction[];
}
