export interface Transaction {
  date: string; // YYYY-MM-DD
  amount: number; // negative = expense, positive = income
  payee: string;
  description: string;
  counterpartyAccount?: string;
}

export interface ParseResult {
  sourceAccountNumber: string;
  transactions: Transaction[];
}

export interface BankParser {
  bankId: string;
  parse(csvContent: string | Buffer): ParseResult;
}
