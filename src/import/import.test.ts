import { describe, it, expect, beforeEach } from "vitest";
import type { AccountMapping } from "../config/config.js";
import type { Transaction } from "../domain/transaction.js";
import { InMemoryLedger, transferPayeeId } from "../test-support/in-memory-ledger.js";
import { executePlan, predictOutcome } from "./execute.js";
import { planImport } from "./plan.js";
import { formatTransfers } from "./report.js";

const ING_NRB = "11000022223333444455556666";
const ERSTE_NRB = "99000011112222333344445555";

let ledger: InMemoryLedger;
let ing: string;
let erste: string;
let mappings: AccountMapping[];

beforeEach(() => {
  ledger = new InMemoryLedger();
  ing = ledger.addAccount("ING");
  erste = ledger.addAccount("Erste");
  mappings = [
    { bankAccountNumber: ING_NRB, actualAccountId: ing },
    { bankAccountNumber: ERSTE_NRB, actualAccountId: erste },
  ];
});

function tx(over: Partial<Transaction> = {}): Transaction {
  return { date: "2026-11-02", amount: -45.5, payee: "Shop", description: "Groceries", ...over };
}

const toErste = (over: Partial<Transaction> = {}) =>
  tx({ amount: -700, payee: "Me", description: "Own transfer", counterpartyAccount: ERSTE_NRB, ...over });
const fromIng = (over: Partial<Transaction> = {}) =>
  tx({ amount: 700, payee: "Me", description: "Own transfer", counterpartyAccount: ING_NRB, ...over });

async function run(account: string, transactions: Transaction[], dryRun = false) {
  const bankAccountNumber = account === ing ? ING_NRB : ERSTE_NRB;
  const plan = await planImport({ transactions, accountId: account, bankAccountNumber, mappings }, ledger);
  const outcome = dryRun ? predictOutcome(plan) : await executePlan(plan, ledger);
  return { plan, outcome, kinds: plan.items.map((i) => i.action.kind) };
}

describe("import pipeline", () => {
  it("imports regular transactions with payee and notes, cleared", async () => {
    const { outcome } = await run(ing, [tx()]);

    expect(outcome).toEqual({ imported: 1, skipped: 0, transfers: 0, errors: [] });
    expect(ledger.inAccount(ing)[0]).toMatchObject({
      date: "2026-11-02",
      amount: -4550,
      payee: "payee:Shop",
      imported_payee: "Shop",
      notes: "Groceries",
      cleared: true,
    });
  });

  it("is idempotent: re-importing the same statement skips everything", async () => {
    await run(ing, [tx(), toErste()]);
    const before = ledger.transactions.length;

    const { kinds, outcome } = await run(ing, [tx(), toErste()]);

    expect(kinds).toEqual(["duplicate", "duplicate"]);
    expect(outcome).toMatchObject({ imported: 0, skipped: 2, transfers: 0 });
    expect(ledger.transactions).toHaveLength(before);
  });

  it("keeps identical same-day transactions distinct", async () => {
    const atm = tx({ amount: -1000, payee: "ATM", description: "Cash" });
    const { outcome } = await run(ing, [atm, atm]);
    expect(outcome.imported).toBe(2);
  });

  it("creates a transfer when the counterparty is a mapped account", async () => {
    const { kinds, outcome } = await run(ing, [toErste()]);

    expect(kinds).toEqual(["transfer"]);
    expect(outcome).toMatchObject({ imported: 1, transfers: 1 });
    const [ingSide] = ledger.inAccount(ing);
    const [ersteSide] = ledger.inAccount(erste);
    expect(ingSide).toMatchObject({ payee: transferPayeeId(erste), transfer_id: ersteSide.id });
    expect(ersteSide).toMatchObject({ amount: 70000, imported_id: null });
  });

  it("adopts the side Actual auto-created when the other bank was imported first", async () => {
    await run(ing, [toErste({ date: "2026-11-02" })]);
    const [mirror] = ledger.inAccount(erste);

    const { kinds, outcome } = await run(erste, [fromIng({ date: "2026-11-03" })]);

    expect(kinds).toEqual(["adopt"]);
    expect(outcome).toMatchObject({ imported: 0, skipped: 1, transfers: 1 });
    expect(ledger.inAccount(erste)).toHaveLength(1);
    expect(ledger.get(mirror.id)).toMatchObject({ imported_payee: "Me", cleared: true });
    expect(ledger.get(mirror.id)?.imported_id).toMatch(/^[0-9a-f]{64}$/);

    // …and importing the Erste statement again is now a no-op.
    expect((await run(erste, [fromIng({ date: "2026-11-03" })])).kinds).toEqual(["duplicate"]);
  });

  it("links to an unlinked counterpart already in the target account", async () => {
    // Imported before the ING account was mapped, so it's a plain transaction.
    const counterpart = ledger.seed({ account: erste, date: "2026-11-04", amount: 70000, imported_id: "erste-1" });

    const { kinds, outcome } = await run(ing, [toErste({ date: "2026-11-02" })]);

    expect(kinds).toEqual(["link"]);
    expect(outcome).toMatchObject({ imported: 1, transfers: 1, errors: [] });
    const [ingSide] = ledger.inAccount(ing);
    expect(ingSide.transfer_id).toBe(counterpart.id);
    expect(ledger.get(counterpart.id)?.transfer_id).toBe(ingSide.id);
    expect(ledger.inAccount(erste)).toHaveLength(1); // no mirror created
  });

  it("does not link the same counterpart twice", async () => {
    ledger.seed({ account: erste, date: "2026-11-02", amount: 70000, imported_id: "erste-1" });

    const { kinds } = await run(ing, [
      toErste({ description: "first" }),
      toErste({ description: "second" }),
    ]);

    expect(kinds).toEqual(["link", "transfer"]);
  });

  it("ignores counterparts outside the date window or already linked", async () => {
    ledger.seed({ account: erste, date: "2026-11-09", amount: 70000 }); // too far
    ledger.seed({ account: erste, date: "2026-11-02", amount: 70000, transfer_id: "tx-elsewhere" });

    const { kinds } = await run(ing, [toErste()]);

    expect(kinds).toEqual(["transfer"]);
  });

  it("adopts only unimported auto-created transfers, not ones already imported", async () => {
    const [ingSide] = ledger.seedTransfer({ account: ing, date: "2026-11-02", amount: -70000 }, erste);
    ingSide.imported_id = "from-an-earlier-statement";

    const { kinds } = await run(ing, [toErste()]);

    expect(kinds).toEqual(["transfer"]);
  });

  it("treats a counterparty mapped to the statement's own account as a regular transaction", async () => {
    const { kinds } = await run(ing, [tx({ counterpartyAccount: ING_NRB })]);
    expect(kinds).toEqual(["create"]);
  });

  it("dry run predicts the real outcome and writes nothing", async () => {
    ledger.seed({ account: erste, date: "2026-11-02", amount: 30000 }); // link target
    await run(ing, [tx({ description: "old" })]);
    ledger.writes.length = 0;
    const statement = [
      tx({ description: "old" }),
      tx({ description: "new" }),
      toErste(),
      toErste({ amount: -300 }),
    ];

    const dry = await run(ing, statement, true);
    expect(ledger.writes).toEqual([]);

    const real = await run(ing, statement);
    expect(dry.outcome).toEqual(real.outcome);
    expect(real.outcome).toEqual({ imported: 3, skipped: 1, transfers: 2, errors: [] });
  });

  it("describes transfers for the report", async () => {
    ledger.seed({ account: erste, date: "2026-11-03", amount: 30000 });
    const { plan } = await run(ing, [toErste(), toErste({ amount: -300 }), tx()], true);

    expect(formatTransfers(plan, new Map([[erste, "Erste"]]))).toEqual([
      "  2026-11-02     -700.00  → Erste  new transfer",
      "  2026-11-02     -300.00  → Erste  link to existing (2026-11-03)",
    ]);
  });
});
