/** Helpers shared by bank parsers. */
import { parse } from "csv-parse/sync";
import * as iconv from "iconv-lite";
import { normalizeAccountNumber } from "../domain/account-number.js";

/** Decode raw file bytes. Strings are assumed to be decoded already. */
export function decode(content: string | Buffer, encoding = "utf-8"): string {
  if (typeof content === "string") return content;
  const text = iconv.decode(content, encoding);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
}

/** Parse delimited text into rows of trimmed-of-nothing raw cells. */
export function readRows(content: string, delimiter: string): string[][] {
  return parse(content, {
    delimiter,
    quote: '"',
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
}

/** Account number cell -> normalized number, or undefined when empty. */
export function cleanAccountNumber(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = normalizeAccountNumber(raw.replace(/"/g, ""));
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Wrap errors from a single row so the user can find it in the file. */
export function atRow<T>(bank: string, row: number, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${bank} CSV, data row ${row}: ${message}`);
  }
}
