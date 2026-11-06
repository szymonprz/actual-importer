import { describe, it, expect } from "vitest";
import {
  pickCounterpart,
  isUnlinked,
  shiftDate,
} from "./transfer-matcher.js";
import type { ExistingTransaction } from "./actual.js";

const ACCOUNTS = new Set(["acct-ing", "acct-santander"]);

function tx(over: Partial<ExistingTransaction>): ExistingTransaction {
  return {
    id: "t1",
    account: "acct-santander",
    date: "2026-06-03",
    amount: 700000,
    transfer_id: null,
    imported_id: "x",
    notes: null,
    ...over,
  };
}

describe("shiftDate", () => {
  it("shifts across month boundaries", () => {
    expect(shiftDate("2026-06-01", -3)).toBe("2026-05-29");
    expect(shiftDate("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("isUnlinked", () => {
  it("treats null and account-id transfer_id as unlinked", () => {
    expect(isUnlinked(tx({ transfer_id: null }), ACCOUNTS)).toBe(true);
    expect(isUnlinked(tx({ transfer_id: "acct-ing" }), ACCOUNTS)).toBe(true);
    expect(isUnlinked(tx({ transfer_id: "some-tx" }), ACCOUNTS)).toBe(false);
  });
});

describe("pickCounterpart", () => {
  const outgoing = { date: "2026-06-02", amount: -700000 };

  it("matches opposite amount one day later", () => {
    const c = tx({ id: "a" });
    expect(pickCounterpart(outgoing, [c], new Set(), ACCOUNTS)?.id).toBe("a");
  });

  it("ignores same-sign amounts, linked transactions and claimed ones", () => {
    const candidates = [
      tx({ id: "same-sign", amount: -700000 }),
      tx({ id: "linked", transfer_id: "other-tx" }),
      tx({ id: "claimed" }),
    ];
    expect(
      pickCounterpart(outgoing, candidates, new Set(["claimed"]), ACCOUNTS)
    ).toBeUndefined();
  });

  it("ignores transactions outside the date window", () => {
    const c = tx({ date: "2026-06-08" });
    expect(pickCounterpart(outgoing, [c], new Set(), ACCOUNTS)).toBeUndefined();
  });

  it("prefers the closest date", () => {
    const candidates = [
      tx({ id: "far", date: "2026-06-05" }),
      tx({ id: "near", date: "2026-06-02" }),
    ];
    expect(pickCounterpart(outgoing, candidates, new Set(), ACCOUNTS)?.id).toBe(
      "near"
    );
  });

  it("repairs transfers broken by older versions (transfer_id = account id)", () => {
    const c = tx({ id: "broken", transfer_id: "acct-ing" });
    expect(pickCounterpart(outgoing, [c], new Set(), ACCOUNTS)?.id).toBe(
      "broken"
    );
  });
});
