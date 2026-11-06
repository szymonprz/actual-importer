import { loadConfig, type Config } from "../config/config.js";
import { withBudget } from "../ledger/actual.js";
import { formatAccountNumber } from "../domain/account-number.js";

export async function accountsCommand(): Promise<void> {
  let config: Config;
  try {
    config = await loadConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  try {
    const accounts = await withBudget(config, (ledger) => ledger.getAccounts());

    console.log("\nActual Budget accounts:\n");
    for (const account of accounts) {
      console.log(`  ${account.id}  ${account.name}`);
      for (const m of config.accountMappings) {
        if (m.actualAccountId === account.id) {
          console.log(`      ← ${formatAccountNumber(m.bankAccountNumber)}${m.bank ? ` (${m.bank})` : ""}`);
        }
      }
    }
    console.log();
  } catch (error) {
    console.error(
      "Failed to connect to Actual Budget:",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  }
}
