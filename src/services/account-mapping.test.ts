import { describe, it, expect } from "vitest";
import {
  findMapping,
  findUnmappedCounterparties,
} from "./account-mapping.js";
import { formatAccountNumber } from "../domain/account-number.js";
import type { Transaction } from "../domain/transaction.js";

const OWN = "10105014611000009704886994";
const WIFE = "20105014611000009704889326";
const SHOP = "30105014611000009704880000";

function tx(counterpartyAccount: string | undefined, payee = "x"): Transaction {
  return { date: "2026-11-01", amount: -1, payee, description: "", counterpartyAccount };
}

describe("findMapping", () => {
  it("matches regardless of spaces and PL prefix", () => {
    const m = { bankAccountNumber: OWN, actualAccountId: "a" };
    expect(findMapping(`PL${formatAccountNumber(OWN)}`, [m])).toBe(m);
  });
});

describe("findUnmappedCounterparties", () => {
  const txs = [
    tx(WIFE, "Monika"),
    tx(WIFE, "Monika"),
    tx(SHOP, "Shop"),
    tx(OWN),
    tx("1915031/19730"), // card terminal, not an account
    tx(undefined),
  ];

  it("returns NRB accounts that aren't mapped, ignored or the source", () => {
    expect(findUnmappedCounterparties(txs, OWN, [], [])).toEqual([
      { accountNumber: WIFE, payee: "Monika", count: 2 },
      { accountNumber: SHOP, payee: "Shop", count: 1 },
    ]);
  });

  it("skips mapped and ignored accounts and applies minCount", () => {
    const mapped = [{ bankAccountNumber: WIFE, actualAccountId: "w" }];
    expect(findUnmappedCounterparties(txs, OWN, mapped, [SHOP])).toEqual([]);
    expect(findUnmappedCounterparties(txs, OWN, [], [], 2)).toHaveLength(1);
  });
});
