/**
 * Checks every registered parser against its sample export in
 * src/parsers/<bankId>/fixtures/sample.csv. A new parser gets these tests
 * for free once it's registered and has a fixture.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isIsoDate } from "../domain/dates.js";
import { isNrb } from "../domain/account-number.js";
import { detectParsers, getParser, parsers } from "./registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (bankId: string) => join(here, bankId, "fixtures", "sample.csv");

describe.each(parsers.map((p) => [p.bankId, p] as const))("%s parser", (bankId, parser) => {
  it("has a sample export at fixtures/sample.csv", () => {
    expect(existsSync(fixture(bankId))).toBe(true);
  });

  const content = () => readFileSync(fixture(bankId));

  it("is found by its id and aliases", () => {
    expect(bankId).toMatch(/^[a-z0-9-]+$/);
    for (const id of [bankId, ...(parser.aliases ?? [])]) {
      expect(getParser(id)).toBe(parser);
    }
  });

  it("is the only parser that detects its sample", () => {
    expect(detectParsers(content()).map((p) => p.bankId)).toEqual([bankId]);
  });

  it("parses the sample into well-formed transactions", () => {
    const { sourceAccountNumber, transactions } = parser.parse(content());

    expect(isNrb(sourceAccountNumber)).toBe(true);
    expect(transactions.length).toBeGreaterThan(0);
    for (const tx of transactions) {
      expect(isIsoDate(tx.date), tx.date).toBe(true);
      expect(Number.isFinite(tx.amount)).toBe(true);
      expect(tx.amount).not.toBe(0);
      expect(typeof tx.payee).toBe("string");
      expect(typeof tx.description).toBe("string");
      expect(tx.payee).toBe(tx.payee.trim());
      if (tx.counterpartyAccount !== undefined) {
        expect(tx.counterpartyAccount).not.toMatch(/[\s']/);
      }
    }
  });
});
