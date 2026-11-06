import { parseDecimalAmount } from "../../domain/money.js";
import type { BankParser, ParseResult } from "../types.js";
import { atRow, cleanAccountNumber, decode, readRows } from "../shared.js";

function parseDate(raw: string): string {
  // Erste uses DD-MM-YYYY; convert to YYYY-MM-DD
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw.trim());
  if (!m) throw new Error(`invalid date format '${raw}'`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Erste Bank Polska (formerly Santander Bank Polska) — same CSV format. */
export class ErsteParser implements BankParser {
  bankId = "erste";
  displayName = "Erste Bank Polska (formerly Santander Bank Polska)";
  // Santander Bank Polska was renamed to Erste; keep the old id working.
  aliases = ["santander"];

  detect(content: Buffer): boolean {
    // Metadata row: generation date (ISO), period start (DD-MM-YYYY), account number, …
    const firstLine = decode(content.subarray(0, 1024), "utf-8").split("\n")[0];
    return /^\d{4}-\d{2}-\d{2},\d{2}-\d{2}-\d{4},"?'?[\d ]{26,32}"?,/.test(firstLine);
  }

  parse(csvContent: string | Buffer): ParseResult {
    const records = readRows(decode(csvContent, "utf-8"), ",");

    if (records.length < 2) {
      return { sourceAccountNumber: "", transactions: [] };
    }

    // First row is metadata:
    // GenerationDate, FromDate, AccountNumber, Owner, Currency, OpenBalance, CloseBalance, Count
    const sourceAccountNumber = cleanAccountNumber(records[0][2]) ?? "";

    const transactions = records
      .slice(1)
      .filter((row) => row.length >= 7)
      // Columns: BookingDate, OperationDate, Title, Counterparty, CounterpartyAccount, Amount, Balance, RowNr
      .map((row, i) =>
        atRow("Erste", i + 1, () => ({
          date: parseDate(row[0]),
          amount: parseDecimalAmount(row[5]),
          payee: (row[3] || "").trim(),
          description: (row[2] || "").trim(),
          counterpartyAccount: cleanAccountNumber(row[4]),
        }))
      );

    return { sourceAccountNumber, transactions };
  }
}
