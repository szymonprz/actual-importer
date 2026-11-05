import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@clack/prompts";
import {
  connectionFromEnv,
  getConfigPath,
  loadConfig,
  readConfigFile,
  saveConnection,
  upsertDotEnv,
  type ConnectionConfig,
} from "../config/config.js";
import {
  connect,
  disconnect,
  getAccounts,
  listBudgets,
  type RemoteBudget,
} from "../services/actual.js";

function exitIfCancel<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

export async function setupCommand(): Promise<void> {
  p.intro("actual-importer setup");

  if (connectionFromEnv()) {
    p.log.info(
      "Connection settings come from environment variables / .env — nothing to configure here."
    );
    await testConnection(await loadConfig());
    return;
  }

  const existing = await readConfigFile();
  if (existing.serverUrl) {
    p.log.info(`Updating existing config at ${getConfigPath()}`);
  }

  const serverUrl = exitIfCancel(
    await p.text({
      message: "Actual Budget server URL:",
      placeholder: "https://actual.example.com",
      initialValue: existing.serverUrl,
      validate: (val) => {
        if (!val) return "Server URL is required";
        try {
          new URL(val);
        } catch {
          return "Please enter a valid URL";
        }
      },
    })
  );

  const passwordInput = exitIfCancel(
    await p.password({
      message: existing.password
        ? "Actual server password (leave empty to keep current):"
        : "Actual server password:",
      validate: (val) => {
        if (!val && !existing.password) return "Password is required";
      },
    })
  );
  const password = passwordInput || existing.password!;

  // Log in and let the user pick a budget instead of hunting for the sync ID.
  const spinner = p.spinner();
  spinner.start("Logging in...");
  let budgets: RemoteBudget[];
  try {
    budgets = await listBudgets(serverUrl, password);
    spinner.stop("Logged in");
  } catch (error) {
    spinner.stop("Login failed");
    p.log.error(error instanceof Error ? error.message : String(error));
    await disconnect();
    process.exit(1);
  }
  await disconnect();

  if (budgets.length === 0) {
    p.log.error("No budgets found on this server.");
    process.exit(1);
  }

  let budget = budgets[0];
  if (budgets.length === 1) {
    p.log.info(`Budget: ${budget.name}`);
  } else {
    const syncId = exitIfCancel(
      await p.select({
        message: "Budget:",
        initialValue: existing.budgetId,
        options: budgets.map((b) => ({
          value: b.syncId,
          label: b.name,
          hint: b.encrypted ? "encrypted" : undefined,
        })),
      })
    );
    budget = budgets.find((b) => b.syncId === syncId)!;
  }

  let e2ePassword: string | undefined;
  if (budget.encrypted) {
    const keep = existing.e2ePassword && existing.budgetId === budget.syncId;
    const input = exitIfCancel(
      await p.password({
        message: keep
          ? "End-to-end encryption password (leave empty to keep current):"
          : "End-to-end encryption password:",
        validate: (val) => {
          if (!val && !keep) return "Encryption password is required";
        },
      })
    );
    e2ePassword = input || existing.e2ePassword;
  }

  const conn: ConnectionConfig = {
    serverUrl,
    password,
    budgetId: budget.syncId,
    e2ePassword,
  };

  if (!(await testConnection(conn))) process.exit(1);

  const dotEnvPath = join(process.cwd(), ".env");
  const target = exitIfCancel(
    await p.select({
      message: "Where should the connection settings be saved?",
      options: [
        {
          value: "global",
          label: getConfigPath(),
          hint: "works from any directory",
        },
        {
          value: "dotenv",
          label: dotEnvPath,
          hint: "only when run from this directory",
        },
      ],
    })
  );

  if (target === "dotenv") {
    const current = existsSync(dotEnvPath)
      ? await readFile(dotEnvPath, "utf-8")
      : "";
    await writeFile(dotEnvPath, upsertDotEnv(current, conn), { mode: 0o600 });
  } else {
    await saveConnection(conn);
  }

  p.outro(
    "Saved. Next: `actual-importer import --file <csv> --bank <ing|santander>`.\n" +
      "  New bank accounts are mapped the first time you import them."
  );
}

async function testConnection(conn: ConnectionConfig): Promise<boolean> {
  const spinner = p.spinner();
  spinner.start("Opening budget...");
  try {
    await connect(conn);
    const accounts = await getAccounts();
    spinner.stop(`Budget opened — ${accounts.length} accounts`);
    return true;
  } catch (error) {
    spinner.stop("Could not open budget");
    p.log.error(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    await disconnect();
  }
}
