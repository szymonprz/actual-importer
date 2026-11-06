import type { Statement, Transaction } from "../domain/transaction.js";

export type { Transaction };
/** What a parser returns. Alias of the domain `Statement`. */
export type ParseResult = Statement;

/**
 * A bank's CSV export format. To add a bank, implement this in
 * src/parsers/<bankId>/index.ts, add it to src/parsers/registry.ts, and put a
 * sample export in src/parsers/<bankId>/fixtures/sample.csv — the contract
 * test (src/parsers/contract.test.ts) then checks it automatically.
 */
export interface BankParser {
  /** Value of `--bank`. Lowercase, no spaces. */
  bankId: string;
  /** Human-readable bank name, e.g. "ING Bank Śląski". */
  displayName: string;
  /** Other accepted `--bank` values (e.g. a bank's former name). */
  aliases?: string[];
  /**
   * True if `content` looks like this bank's export. Used to pick a parser
   * when `--bank` is omitted, so keep it cheap and specific: it must not
   * match other banks' files.
   */
  detect(content: Buffer): boolean;
  /** Raw file bytes in, statement out. Throw with a helpful message on malformed input. */
  parse(content: string | Buffer): ParseResult;
}
