import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as iconv from "iconv-lite";
import { IngParser } from "../../parsers/ing/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "../fixtures/ing-sample.csv");

describe("IngParser", () => {
  const parser = new IngParser();

  it("should have bankId 'ing'", () => {
    expect(parser.bankId).toBe("ing");
  });

  it("should parse all transactions from fixture", () => {
    const buffer = readFileSync(fixturePath);
    const transactions = parser.parse(buffer);
    expect(transactions).toHaveLength(5);
  });

  it("should parse dates in YYYY-MM-DD format", () => {
    const buffer = readFileSync(fixturePath);
    const transactions = parser.parse(buffer);
    expect(transactions[0].date).toBe("2026-04-01");
    expect(transactions[4].date).toBe("2026-04-05");
  });

  it("should parse amounts correctly", () => {
    const buffer = readFileSync(fixturePath);
    const transactions = parser.parse(buffer);
    expect(transactions[0].amount).toBe(-45.5);
    expect(transactions[2].amount).toBe(1500);
    expect(transactions[3].amount).toBe(-7000);
  });

  it("should extract payee names trimmed", () => {
    const buffer = readFileSync(fixturePath);
    const transactions = parser.parse(buffer);
    expect(transactions[0].payee).toBe("Sklep Testowy");
    expect(transactions[2].payee).toBe("Firma Przykład Sp. z o.o.");
  });

  it("should extract counterparty account when present", () => {
    const buffer = readFileSync(fixturePath);
    const transactions = parser.parse(buffer);
    expect(transactions[0].counterpartyAccount).toBe(
      "22000033334444555566667777"
    );
    expect(transactions[1].counterpartyAccount).toBe(
      "33000044445555666677778888"
    );
  });

  it("should have undefined counterparty for card payments", () => {
    const buffer = readFileSync(fixturePath);
    const transactions = parser.parse(buffer);
    expect(transactions[2].counterpartyAccount).toBeUndefined();
    expect(transactions[4].counterpartyAccount).toBeUndefined();
  });

  it("should return empty array for CSV with no data rows", () => {
    const header = `"Lista transakcji";;;;;"ING Bank";;;;;;;;;;;;;;;
"Dokument nr 999";
"Wygenerowany dnia: 2026-04-06";;;;;;;;;;;;;;;;;;;;

"Dane Użytkownika:";
"JAN TESTOWY";

"Wybrane rachunki:";
"KONTO Direct (PLN)";;"11 0000 2222 3333 4444 5555 6666";

"Zastosowane kryteria wyboru";;;;;"Podsumowanie";;

"Zakres dat:";"2026-01-01";"Typy transakcji:";"wszystkie";;"Liczba transakcji:";0;

;;;;;"Suma uznań (0):";0;PLN;;;;;;;;;;;;;

;;;;;"Suma obciążeń (0):";0;PLN;;;;;;;;;;;;;

"Data transakcji";"Data księgowania";"Dane kontrahenta";"Tytuł";"Nr rachunku";"Nazwa banku";"Szczegóły";"Nr transakcji";"Kwota transakcji (waluta rachunku)";"Waluta";"Kwota blokady/zwolnienie blokady";"Waluta";"Kwota płatności w walucie";"Waluta";"Saldo po transakcji";"Waluta";;;;;


"Dokument ma charakter informacyjny";
`;
    const buffer = iconv.encode(header, "cp1250");
    const transactions = parser.parse(buffer);
    expect(transactions).toHaveLength(0);
  });
});
