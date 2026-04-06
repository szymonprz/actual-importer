import { configExists, loadConfig } from "../config/config.js";
import { connect, disconnect, getAccounts } from "../services/actual.js";

export async function accountsCommand(): Promise<void> {
  if (!configExists()) {
    console.error(
      "Configuration not found. Run `actual-importer setup` first."
    );
    process.exit(1);
  }

  const config = await loadConfig();

  try {
    await connect(config);
    const accounts = await getAccounts();

    console.log("\nActual Budget accounts:\n");
    for (const account of accounts) {
      console.log(`  ${account.id}  ${account.name}`);
    }
    console.log();
  } catch (error) {
    console.error(
      "Failed to connect to Actual Budget:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    await disconnect();
  }
}
