import { describe, it, expect } from "vitest";
import { detectTransfer } from "../../services/transfer-detector.js";
import type { Transaction } from "../../parsers/types.js";
import type { AccountMapping } from "../../config/config.js";

const mappings: AccountMapping[] = [
  {
    bankAccountNumber: "11000022223333444455556600",
    actualAccountId: "acc-ing-1",
    bank: "ing",
  },
  {
    bankAccountNumber: "99000011112222333344445555",
    actualAccountId: "acc-santander-1",
    bank: "santander",
  },
];

describe("detectTransfer", () => {
  it("should detect a transfer when counterparty matches a mapped account", () => {
    const tx: Transaction = {
      date: "2026-04-01",
      amount: -7000,
      payee: "Jan Testowy",
      description: "Przelew własny",
      counterpartyAccount: "99000011112222333344445555",
    };

    const result = detectTransfer(tx, mappings);
    expect(result.isTransfer).toBe(true);
    expect(result.targetActualAccountId).toBe("acc-santander-1");
  });

  it("should not detect a transfer for unknown counterparty", () => {
    const tx: Transaction = {
      date: "2026-04-01",
      amount: -100,
      payee: "Sklep",
      description: "Zakupy",
      counterpartyAccount: "00000000000000000000000000",
    };

    const result = detectTransfer(tx, mappings);
    expect(result.isTransfer).toBe(false);
    expect(result.targetActualAccountId).toBeUndefined();
  });

  it("should not detect a transfer when counterparty is missing", () => {
    const tx: Transaction = {
      date: "2026-04-01",
      amount: -50,
      payee: "Serwis Streamingowy",
      description: "Subskrypcja",
    };

    const result = detectTransfer(tx, mappings);
    expect(result.isTransfer).toBe(false);
  });

  it("should match counterparty with spaces against normalized mapping", () => {
    const tx: Transaction = {
      date: "2026-04-01",
      amount: -7000,
      payee: "Jan Testowy",
      description: "Przelew",
      counterpartyAccount: "99 0000 1111 2222 3333 4444 5555",
    };

    const result = detectTransfer(tx, mappings);
    expect(result.isTransfer).toBe(true);
    expect(result.targetActualAccountId).toBe("acc-santander-1");
  });
});
