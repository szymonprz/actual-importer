import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SantanderParser } from "../../parsers/santander/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "../fixtures/santander-sample.csv");

describe("SantanderParser", () => {
  const parser = new SantanderParser();

  it("should have bankId 'santander'", () => {
    expect(parser.bankId).toBe("santander");
  });

  it("should parse all transactions from fixture", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const transactions = parser.parse(content);
    expect(transactions).toHaveLength(4);
  });

  it("should convert dates from DD-MM-YYYY to YYYY-MM-DD", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const transactions = parser.parse(content);
    expect(transactions[0].date).toBe("2026-04-01");
    expect(transactions[1].date).toBe("2026-03-15");
  });

  it("should parse amounts correctly including negatives", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const transactions = parser.parse(content);
    expect(transactions[0].amount).toBe(-439.03);
    expect(transactions[2].amount).toBe(407.26);
    expect(transactions[3].amount).toBe(7000);
  });

  it("should extract payee and description", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const transactions = parser.parse(content);
    expect(transactions[0].payee).toBe("Centrum Kart");
    expect(transactions[0].description).toBe("Splata karty kredytowej");
  });

  it("should extract counterparty account numbers", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const transactions = parser.parse(content);
    expect(transactions[0].counterpartyAccount).toBe(
      "44000055556666777788889999"
    );
  });

  it("should detect transfer counterparty account", () => {
    const content = readFileSync(fixturePath, "utf-8");
    const transactions = parser.parse(content);
    // Last row: transfer from ING account
    expect(transactions[3].counterpartyAccount).toBe(
      "11000022223333444455556666"
    );
  });

  it("should return empty array for empty content", () => {
    const transactions = parser.parse("");
    expect(transactions).toHaveLength(0);
  });
});
