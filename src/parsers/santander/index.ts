import { parse } from "csv-parse/sync";
import type { BankParser, Transaction } from "../types.js";

function parseDate(raw: string): string {
  // Santander uses DD-MM-YYYY format, convert to YYYY-MM-DD
  const parts = raw.split("-");
  if (parts.length !== 3) {
    throw new Error(`Santander CSV: invalid date format '${raw}'`);
  }
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function parseAmount(raw: string): number {
  // Santander uses comma as decimal separator, e.g. "-439,03"
  return parseFloat(raw.replace(",", "."));
}

function cleanAccountNumber(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/['\s]/g, "");
  return cleaned.length > 0 ? cleaned : undefined;
}

export class SantanderParser implements BankParser {
  bankId = "santander";

  parse(csvContent: string | Buffer): Transaction[] {
    const content =
      typeof csvContent === "string"
        ? csvContent
        : csvContent.toString("utf-8");

    const records = parse(content, {
      delimiter: ",",
      quote: '"',
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];

    if (records.length < 2) {
      return [];
    }

    // First row is the header metadata row, skip it
    const dataRows = records.slice(1);

    return dataRows
      .filter((row) => row.length >= 7)
      .map((row) => {
        // Columns: BookingDate, OperationDate, Title, Counterparty, CounterpartyAccount, Amount, Balance, RowNr
        const date = parseDate(row[0]);
        const description = (row[2] || "").trim();
        const payee = (row[3] || "").trim();
        const counterpartyAccount = cleanAccountNumber(row[4]);
        const amount = parseAmount(row[5]);

        return {
          date,
          amount,
          payee,
          description,
          counterpartyAccount,
        };
      });
  }
}
