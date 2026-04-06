import type { BankParser } from "./types.js";
import { IngParser } from "./ing/index.js";
import { SantanderParser } from "./santander/index.js";

const parsers: Map<string, BankParser> = new Map();

function register(parser: BankParser): void {
  parsers.set(parser.bankId, parser);
}

register(new IngParser());
register(new SantanderParser());

export function getParser(bankId: string): BankParser | undefined {
  return parsers.get(bankId);
}

export function getAvailableBankIds(): string[] {
  return Array.from(parsers.keys());
}
