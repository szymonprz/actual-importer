import { loadConfig } from "../config/config.js";
import { formatAccountNumber } from "../domain/account-number.js";
import { withBudget } from "../ledger/actual.js";
import { createContext, defineCommand, result } from "./runtime.js";

export const accountsCommand = defineCommand({
  command: "accounts",
  describe: "List Actual Budget accounts and the bank accounts mapped to them",
  builder: (yargs) =>
    yargs.option("json", { type: "boolean", describe: "Print JSON" }),
  handler: async (argv) => {
    const ctx = createContext(argv);
    const config = await loadConfig();
    const accounts = await withBudget(config, (ledger) => ledger.getAccounts());

    const rows = accounts.map((a) => ({
      ...a,
      mappings: config.accountMappings
        .filter((m) => m.actualAccountId === a.id)
        .map((m) => ({ bankAccountNumber: m.bankAccountNumber, bank: m.bank })),
    }));

    const lines = ["", "Actual Budget accounts:", ""];
    for (const a of rows) {
      lines.push(`  ${a.id}  ${a.name}`);
      for (const m of a.mappings) {
        lines.push(`      ← ${formatAccountNumber(m.bankAccountNumber)}${m.bank ? ` (${m.bank})` : ""}`);
      }
    }
    result(ctx, lines.join("\n") + "\n", rows);
  },
});
