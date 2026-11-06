import type { BankParser } from "./types.js";
import { IngParser } from "./ing/index.js";
import { ErsteParser } from "./erste/index.js";

/** Every supported bank. Add new parsers here. */
export const parsers: readonly BankParser[] = [new IngParser(), new ErsteParser()];

export function getParser(bankId: string): BankParser | undefined {
  const id = bankId.toLowerCase();
  return parsers.find((p) => p.bankId === id || p.aliases?.includes(id));
}

export function getAvailableBankIds(): string[] {
  return parsers.map((p) => p.bankId);
}

/** Parsers whose `detect` accepts this file. More than one means ambiguous. */
export function detectParsers(content: Buffer): BankParser[] {
  return parsers.filter((p) => p.detect(content));
}
