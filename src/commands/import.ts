import { readFile } from "node:fs/promises";
import { loadConfig, type AccountMapping, type Config } from "../config/config.js";
import type { Statement } from "../domain/transaction.js";
import {
  findMapping,
  findUnmappedCounterparties,
} from "../import/account-mapping.js";
import { executePlan, predictOutcome } from "../import/execute.js";
import { filterByDate } from "../import/filter.js";
import { planImport } from "../import/plan.js";
import { formatReport, formatSummary, formatTransfers } from "../import/report.js";
import { withBudget } from "../ledger/actual.js";
import type { Ledger, LedgerAccount } from "../ledger/ledger.js";
import { getAvailableBankIds, getParser } from "../parsers/registry.js";
import {
  canPrompt,
  promptCounterpartyMappings,
  promptSourceMapping,
} from "./mapping-prompts.js";

interface ImportArgs {
  file: string;
  bank: string;
  dryRun: boolean;
  from?: string;
  to?: string;
}

/** Counterparty accounts seen fewer times than this are not offered for mapping. */
const MIN_COUNTERPARTY_OCCURRENCES = 2;
const MAX_COUNTERPARTY_PROMPTS = 12;

export async function importCommand(args: ImportArgs): Promise<void> {
  const parser = getParser(args.bank);
  if (!parser) {
    console.error(
      `Unknown bank: '${args.bank}'. Available banks: ${getAvailableBankIds().join(", ")}`
    );
    process.exit(1);
  }

  let config: Config;
  try {
    config = await loadConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  let csvData: Buffer;
  try {
    csvData = await readFile(args.file);
  } catch (error) {
    console.error(
      `Failed to read file '${args.file}':`,
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }

  let statement: Statement;
  try {
    statement = parser.parse(csvData);
  } catch (error) {
    console.error(
      `Failed to parse CSV with ${args.bank} parser:`,
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }

  const total = statement.transactions.length;
  statement.transactions = filterByDate(statement.transactions, args);
  if (statement.transactions.length < total) {
    console.log(
      `Date filter: importing ${statement.transactions.length} of ${total} transactions.`
    );
  }

  if (statement.transactions.length === 0) {
    console.log(formatSummary({ imported: 0, skipped: 0, transfers: 0, errors: [] }, args.dryRun));
    return;
  }

  try {
    // Connect in dry-run too: it's read-only and lets us report exactly what
    // would be skipped, and which transfers would be linked vs. created.
    await withBudget(config, (ledger) =>
      importStatement(ledger, config, statement, args)
    );
  } catch (error) {
    console.error(
      "Failed to import transactions:",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  }
}

async function importStatement(
  ledger: Ledger,
  config: Config,
  statement: Statement,
  args: ImportArgs
): Promise<void> {
  const accounts = await ledger.getAccounts();

  const source = await resolveSourceMapping(config, statement, args.bank, accounts);
  if (!source) {
    console.error(
      `No Actual account mapped for bank account '${statement.sourceAccountNumber}'.\n` +
        "Run the import in an interactive terminal to map it."
    );
    process.exitCode = 1;
    return;
  }

  // Offer unknown counterparty accounts — some may be the user's own.
  if (canPrompt()) {
    await promptCounterpartyMappings(
      config,
      findUnmappedCounterparties(
        statement.transactions,
        statement.sourceAccountNumber,
        config.accountMappings,
        config.ignoredCounterparties ?? [],
        MIN_COUNTERPARTY_OCCURRENCES
      ),
      accounts,
      MAX_COUNTERPARTY_PROMPTS
    );
  }

  const plan = await planImport(
    {
      transactions: statement.transactions,
      accountId: source.actualAccountId,
      bankAccountNumber: source.bankAccountNumber,
      mappings: config.accountMappings,
    },
    ledger
  );
  const outcome = args.dryRun
    ? predictOutcome(plan)
    : await executePlan(plan, ledger);

  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  console.log(formatReport(formatTransfers(plan, accountNames), outcome, args.dryRun));
}

/** The mapping for the statement's own account, asking the user if it's new. */
async function resolveSourceMapping(
  config: Config,
  statement: Statement,
  bank: string,
  accounts: LedgerAccount[]
): Promise<AccountMapping | undefined> {
  const existing = findMapping(statement.sourceAccountNumber, config.accountMappings);
  if (existing || !canPrompt()) return existing;
  return promptSourceMapping(config, statement.sourceAccountNumber, bank, accounts);
}
