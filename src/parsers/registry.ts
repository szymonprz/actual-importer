import type { BankParser } from "./types.js";
import { IngParser } from "./ing/index.js";
import { ErsteParser } from "./erste/index.js";

const parsers: Map<string, BankParser> = new Map();
const aliases: Map<string, string> = new Map();

function register(parser: BankParser, ...alias: string[]): void {
  parsers.set(parser.bankId, parser);
  for (const a of alias) aliases.set(a, parser.bankId);
}

register(new IngParser());
// Santander Bank Polska was renamed to Erste; keep the old id working.
register(new ErsteParser(), "santander");

export function getParser(bankId: string): BankParser | undefined {
  return parsers.get(aliases.get(bankId) ?? bankId);
}

export function getAvailableBankIds(): string[] {
  return Array.from(parsers.keys());
}
