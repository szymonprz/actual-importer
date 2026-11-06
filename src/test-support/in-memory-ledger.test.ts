import { describe, it, expect } from "vitest";
import { InMemoryLedger, transferPayeeId } from "./in-memory-ledger.js";

describe("InMemoryLedger", () => {
  it("skips transactions whose imported_id already exists in the account", async () => {
    const ledger = new InMemoryLedger();
    const acct = ledger.addAccount("ING");
    const tx = { date: "2026-11-01", amount: -100, imported_id: "a" };

    expect((await ledger.importTransactions(acct, [tx])).added).toHaveLength(1);
    expect((await ledger.importTransactions(acct, [tx])).added).toHaveLength(0);
    expect(ledger.inAccount(acct)).toHaveLength(1);
  });

  it("creates the other side of a transfer, like Actual", async () => {
    const ledger = new InMemoryLedger();
    const ing = ledger.addAccount("ING");
    const erste = ledger.addAccount("Erste");

    const { added } = await ledger.importTransactions(ing, [
      { date: "2026-11-01", amount: -5000, payee: transferPayeeId(erste), imported_id: "a" },
    ]);

    const [mirror] = ledger.inAccount(erste);
    expect(mirror).toMatchObject({ amount: 5000, imported_id: null, transfer_id: added[0] });
    expect(ledger.get(added[0])?.transfer_id).toBe(mirror.id);
  });

  it("links two transactions as a transfer pair", async () => {
    const ledger = new InMemoryLedger();
    const ing = ledger.addAccount("ING");
    const erste = ledger.addAccount("Erste");
    const a = ledger.seed({ account: ing, date: "2026-11-01", amount: -5000 });
    const b = ledger.seed({ account: erste, date: "2026-11-02", amount: 5000 });

    await ledger.linkTransfer(a, b);

    expect(ledger.get(a.id)).toMatchObject({ transfer_id: b.id, payee: transferPayeeId(erste) });
    expect(ledger.get(b.id)).toMatchObject({ transfer_id: a.id, payee: transferPayeeId(ing) });
  });
});
