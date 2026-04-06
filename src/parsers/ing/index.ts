import { parse } from "csv-parse/sync";
import * as iconv from "iconv-lite";
import type { BankParser, ParseResult } from "../types.js";

const DATA_ROW_START_MARKER = "Data transakcji";

function cleanAccountNumber(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Remove leading apostrophe, surrounding quotes/spaces
  const cleaned = raw.replace(/['\s]/g, "");
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseAmount(raw: string): number {
  // ING uses comma as decimal separator, e.g. "-60,00"
  return parseFloat(raw.replace(",", "."));
}

function findDataStartLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`"${DATA_ROW_START_MARKER}"`)) {
      return i + 1; // data starts on the next line
    }
  }
  throw new Error(
    "ING CSV: could not find header row starting with 'Data transakcji'"
  );
}

function extractSourceAccount(lines: string[]): string {
  // ING CSV has the source account on the line after "Wybrane rachunki:"
  // Format: "KONTO Direct (PLN)";;"10 1050 1461 1000 0097 0488 6994";
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Wybrane rachunki")) {
      const accountLine = lines[i + 1];
      if (accountLine) {
        const parts = accountLine.split(";");
        // Account number is in the 3rd field (index 2)
        const raw = parts[2];
        const cleaned = cleanAccountNumber(raw?.replace(/"/g, ""));
        if (cleaned) return cleaned;
      }
    }
  }
  throw new Error("ING CSV: could not find source account number");
}

export class IngParser implements BankParser {
  bankId = "ing";

  parse(csvBuffer: Buffer): ParseResult {
    const content = iconv.decode(csvBuffer, "cp1250");
    const lines = content.split("\n");

    const sourceAccountNumber = extractSourceAccount(lines);

    const dataStart = findDataStartLine(lines);
    const dataLines = lines
      .slice(dataStart)
      .filter((line) => line.trim().length > 0 && !line.startsWith('"Dokument'));

    if (dataLines.length === 0) {
      return { sourceAccountNumber, transactions: [] };
    }

    const csvData = dataLines.join("\n");
    const records = parse(csvData, {
      delimiter: ";",
      quote: '"',
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];

    const transactions = records
      .filter((row) => {
        if (row.length < 9 || !row[0].match(/^\d{4}-\d{2}-\d{2}$/)) return false;
        // Skip pending transactions (empty booking date) — they'll appear as booked later
        if (!row[1]?.trim()) return false;
        return true;
      })
      .map((row) => {
        const date = row[0]; // YYYY-MM-DD already
        const payee = (row[2] || "").trim();
        const description = (row[3] || "").trim();
        const counterpartyAccount = cleanAccountNumber(row[4]);
        const amount = parseAmount(row[8]);

        return {
          date,
          amount,
          payee,
          description,
          counterpartyAccount,
        };
      });

    return { sourceAccountNumber, transactions };
  }
}
