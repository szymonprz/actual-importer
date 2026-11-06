import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ErsteParser } from "./index.js";
import { getParser } from "../registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures/sample.csv");

describe("ErsteParser", () => {
  const parser = new ErsteParser();

  it("should have bankId 'erste' and accept the old 'santander' id", () => {
    expect(parser.bankId).toBe("erste");
    expect(getParser("santander")?.bankId).toBe("erste");
  });

  it("should extract source account number from header row", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const result = parser.parse(content);
    expect(result.sourceAccountNumber).toBe("99000011112222333344445555");
  });

  it("should parse all transactions from fixture", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const result = parser.parse(content);
    expect(result.transactions).toHaveLength(4);
  });

  it("should convert dates from DD-MM-YYYY to YYYY-MM-DD", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const { transactions } = parser.parse(content);
    expect(transactions[0].date).toBe("2026-04-01");
    expect(transactions[1].date).toBe("2026-03-15");
  });

  it("should parse amounts correctly including negatives", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const { transactions } = parser.parse(content);
    expect(transactions[0].amount).toBe(-439.03);
    expect(transactions[2].amount).toBe(407.26);
    expect(transactions[3].amount).toBe(7000);
  });

  it("should extract payee and description", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const { transactions } = parser.parse(content);
    expect(transactions[0].payee).toBe("Centrum Kart");
    expect(transactions[0].description).toBe("Splata karty kredytowej");
  });

  it("should extract counterparty account numbers", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const { transactions } = parser.parse(content);
    expect(transactions[0].counterpartyAccount).toBe(
      "44000055556666777788889999"
    );
  });

  it("should detect transfer counterparty account", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const { transactions } = parser.parse(content);
    // Last row: transfer from ING account
    expect(transactions[3].counterpartyAccount).toBe(
      "11000022223333444455556666"
    );
  });

  it("should return empty transactions for empty content", () => {
    const result = parser.parse("");
    expect(result.transactions).toHaveLength(0);
  });

  it("reports the row of a malformed amount instead of importing NaN", () => {
    const csv =
      '06-11-2026,01-11-2026,"\'11 0000 2222 3333 4444 5555 6666",X,PLN,0,0,1\n' +
      '05-11-2026,05-11-2026,"Title","Shop","",abc,"0,00",1\n';
    expect(() => parser.parse(csv)).toThrow(/Erste CSV, data row 1: invalid amount 'abc'/);
  });
});
