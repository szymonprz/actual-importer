import * as p from "@clack/prompts";
import { saveConfig, type AccountMapping, type Config } from "../config/config.js";
import { connect, disconnect, getAccounts } from "../services/actual.js";

export async function setupCommand(): Promise<void> {
  p.intro("actual-importer setup");

  const serverUrl = await p.text({
    message: "Actual Budget server URL:",
    placeholder: "https://actual.example.com",
    validate: (val) => {
      if (!val) return "Server URL is required";
      try {
        new URL(val);
      } catch {
        return "Please enter a valid URL";
      }
    },
  });
  if (p.isCancel(serverUrl)) return process.exit(0);

  const password = await p.password({
    message: "Actual Budget API password:",
    validate: (val) => {
      if (!val) return "Password is required";
    },
  });
  if (p.isCancel(password)) return process.exit(0);

  const budgetId = await p.text({
    message: "Budget file ID (sync ID):",
    validate: (val) => {
      if (!val) return "Budget file ID is required";
    },
  });
  if (p.isCancel(budgetId)) return process.exit(0);

  const hasE2e = await p.confirm({
    message: "Is end-to-end encryption enabled?",
  });
  if (p.isCancel(hasE2e)) return process.exit(0);

  let e2ePassword: string | undefined;
  if (hasE2e) {
    const e2eInput = await p.password({
      message: "End-to-end encryption password:",
      validate: (val) => {
        if (!val) return "Encryption password is required";
      },
    });
    if (p.isCancel(e2eInput)) return process.exit(0);
    e2ePassword = e2eInput;
  }

  // Connect and fetch accounts
  const tempConfig: Config = {
    serverUrl,
    password,
    budgetId,
    e2ePassword,
    accountMappings: [],
  };

  const spinner = p.spinner();
  spinner.start("Connecting to Actual Budget...");

  let accounts;
  try {
    await connect(tempConfig);
    accounts = await getAccounts();
    spinner.stop("Connected successfully");
  } catch (error) {
    spinner.error("Connection failed");
    p.log.error(
      `Failed to connect: ${error instanceof Error ? error.message : error}`
    );
    await disconnect();
    process.exit(1);
  }

  if (accounts.length === 0) {
    p.log.warn("No accounts found in this budget.");
    await disconnect();
    process.exit(1);
  }

  // Display accounts
  p.log.info("Available Actual Budget accounts:");
  for (const account of accounts) {
    p.log.message(`  ${account.id}  ${account.name}`);
  }

  // Map bank accounts
  const accountMappings: AccountMapping[] = [];

  let addMore = true;
  while (addMore) {
    const bankAccountNumber = await p.text({
      message: "Bank account number (e.g. 10 1050 1461 ...):",
      validate: (val) => {
        if (!val) return "Account number is required";
      },
    });
    if (p.isCancel(bankAccountNumber)) break;

    const actualAccountId = await p.select({
      message: "Map to Actual Budget account:",
      options: accounts.map((a) => ({ value: a.id, label: a.name })),
    });
    if (p.isCancel(actualAccountId)) break;

    const bank = await p.select({
      message: "Bank:",
      options: [
        { value: "ing", label: "ING Bank Śląski" },
        { value: "santander", label: "Santander Bank Polska" },
      ],
    });
    if (p.isCancel(bank)) break;

    accountMappings.push({
      bankAccountNumber: bankAccountNumber.replace(/\s/g, ""),
      actualAccountId,
      bank,
    });

    const continueAdding = await p.confirm({
      message: "Add another account mapping?",
    });
    if (p.isCancel(continueAdding) || !continueAdding) {
      addMore = false;
    }
  }

  await disconnect();

  if (accountMappings.length === 0) {
    p.log.warn("No account mappings configured. Setup incomplete.");
    process.exit(1);
  }

  const config: Config = {
    serverUrl,
    password,
    budgetId,
    e2ePassword,
    accountMappings,
  };

  await saveConfig(config);
  p.outro("Configuration saved. You can now run `actual-importer import`.");
}
