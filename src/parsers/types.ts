import type { Statement, Transaction } from "../domain/transaction.js";

export type { Transaction };
/** What a parser returns. Alias of the domain `Statement`. */
export type ParseResult = Statement;

export interface BankParser {
  /** Value of `--bank`. Lowercase, no spaces. */
  bankId: string;
  /** Raw file bytes in, statement out. Throw with a helpful message on malformed input. */
  parse(csvContent: string | Buffer): ParseResult;
}
