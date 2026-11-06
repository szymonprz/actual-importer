import { isIsoDate } from "../../domain/dates.js";
import { parseDecimalAmount } from "../../domain/money.js";
import type { BankParser, ParseResult } from "../types.js";
import { atRow, cleanAccountNumber, decode, readRows } from "../shared.js";

const DATA_ROW_START_MARKER = "Data transakcji";

function findDataStartLine(lines: string[]): number {
  const i = lines.findIndex((line) =>
    line.startsWith(`"${DATA_ROW_START_MARKER}"`)
  );
  if (i === -1) {
    throw new Error(
      `ING CSV: could not find header row starting with '${DATA_ROW_START_MARKER}'`
    );
  }
  return i + 1; // data starts on the next line
}

function extractSourceAccount(lines: string[]): string {
  // The source account is on the line after "Wybrane rachunki:", 3rd field:
  // "KONTO Direct (PLN)";;"10 1050 1461 1000 0097 0488 6994";
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("Wybrane rachunki")) continue;
    const cleaned = cleanAccountNumber(lines[i + 1]?.split(";")[2]);
    if (cleaned) return cleaned;
  }
  throw new Error("ING CSV: could not find source account number");
}

/** ING Bank Śląski — CP1250, semicolon-delimited, metadata block before the data. */
export class IngParser implements BankParser {
  bankId = "ing";
  displayName = "ING Bank Śląski";

  detect(content: Buffer): boolean {
    return decode(content.subarray(0, 8192), "cp1250")
      .split("\n")
      .some((line) => line.startsWith(`"${DATA_ROW_START_MARKER}";`));
  }

  parse(csvContent: string | Buffer): ParseResult {
    const lines = decode(csvContent, "cp1250").split("\n");
    const sourceAccountNumber = extractSourceAccount(lines);

    const dataLines = lines
      .slice(findDataStartLine(lines))
      .filter((line) => line.trim().length > 0 && !line.startsWith('"Dokument'));

    if (dataLines.length === 0) {
      return { sourceAccountNumber, transactions: [] };
    }

    const transactions = readRows(dataLines.join("\n"), ";")
      .filter(
        (row) =>
          row.length >= 9 &&
          isIsoDate(row[0]) &&
          // Pending transactions have no booking date; they'll appear as booked later.
          Boolean(row[1]?.trim())
      )
      // Columns: transaction date, booking date, counterparty, title, counterparty account, …, amount (9th)
      .map((row, i) =>
        atRow("ING", i + 1, () => ({
          date: row[0],
          amount: parseDecimalAmount(row[8]),
          payee: (row[2] || "").trim(),
          description: (row[3] || "").trim(),
          counterpartyAccount: cleanAccountNumber(row[4]),
        }))
      );

    return { sourceAccountNumber, transactions };
  }
}
