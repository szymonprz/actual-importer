import { readFile } from "node:fs/promises";
import { loadConfig, type AccountMapping, type Config } from "../config/config.js";
import { isIsoDate } from "../domain/dates.js";
import type { Statement } from "../domain/transaction.js";
import {
  findMapping,
  findUnmappedCounterparties,
} from "../import/account-mapping.js";
import { executePlan, predictOutcome, type ImportOutcome } from "../import/execute.js";
import { filterByDate } from "../import/filter.js";
import { planImport } from "../import/plan.js";
import { formatReport, formatTransfers, planToJson } from "../import/report.js";
import { withBudget } from "../ledger/actual.js";
import type { Ledger, LedgerAccount } from "../ledger/ledger.js";
import { getAvailableBankIds, getParser } from "../parsers/registry.js";
import {
  promptCounterpartyMappings,
  promptSourceMapping,
} from "./mapping-prompts.js";
import {
  createContext,
  defineCommand,
  errorMessage,
  info,
  result,
  UserError,
  type CommandContext,
  type GlobalArgs,
} from "./runtime.js";

export interface ImportArgs extends GlobalArgs {
  file: string;
  bank: string;
  dryRun: boolean;
  from?: string;
  to?: string;
}

/** Counterparty accounts seen fewer times than this are not offered for mapping. */
const MIN_COUNTERPARTY_OCCURRENCES = 2;
const MAX_COUNTERPARTY_PROMPTS = 12;

export const importCommand = defineCommand({
  command: "import",
  describe: "Import transactions from a bank CSV file",
  builder: (yargs) =>
    yargs
      .option("file", {
        alias: "f",
        type: "string",
        describe: "Path to the CSV file",
        demandOption: true,
      })
      .option("bank", {
        alias: "b",
        type: "string",
        describe: `Bank identifier (${getAvailableBankIds().join(", ")})`,
        demandOption: true,
      })
      .option("from", {
        type: "string",
        describe: "Only import transactions on or after this date (YYYY-MM-DD)",
      })
      .option("to", {
        type: "string",
        describe: "Only import transactions on or before this date (YYYY-MM-DD)",
      })
      .option("dry-run", {
        type: "boolean",
        describe: "Preview import without writing to Actual Budget",
        default: false,
      })
      .option("json", {
        type: "boolean",
        describe: "Print the result as JSON (implies --no-input)",
      })
      .check((argv) => {
        for (const key of ["from", "to"] as const) {
          const v = argv[key];
          if (v !== undefined && !isIsoDate(v)) {
            return `--${key} must be a date in YYYY-MM-DD format`;
          }
        }
        return true;
      }),
  handler: async (argv) => {
    const outcome = await runImport(argv, createContext(argv));
    if (outcome.errors.length > 0) process.exitCode = 1;
  },
});

export async function runImport(
  args: ImportArgs,
  ctx: CommandContext
): Promise<ImportOutcome> {
  const parser = getParser(args.bank);
  if (!parser) {
    throw new UserError(
      `Unknown bank: '${args.bank}'. Available banks: ${getAvailableBankIds().join(", ")}`
    );
  }

  const config = await loadConfig();

  let statement: Statement;
  try {
    statement = parser.parse(await readFile(args.file));
  } catch (error) {
    throw new UserError(`Failed to read '${args.file}' as ${args.bank} CSV: ${errorMessage(error)}`);
  }

  const total = statement.transactions.length;
  statement.transactions = filterByDate(statement.transactions, args);
  if (statement.transactions.length < total) {
    info(ctx, `Date filter: importing ${statement.transactions.length} of ${total} transactions.`);
  }

  if (statement.transactions.length === 0) {
    const outcome: ImportOutcome = { imported: 0, skipped: 0, transfers: 0, errors: [] };
    result(ctx, formatReport([], outcome, args.dryRun), {
      dryRun: args.dryRun,
      file: args.file,
      bank: args.bank,
      outcome,
      transactions: [],
    });
    return outcome;
  }

  // Connect in dry-run too: it's read-only and lets us report exactly what
  // would be skipped, and which transfers would be linked vs. created.
  return withBudget(config, (ledger) =>
    importStatement(ledger, config, statement, args, ctx)
  );
}

async function importStatement(
  ledger: Ledger,
  config: Config,
  statement: Statement,
  args: ImportArgs,
  ctx: CommandContext
): Promise<ImportOutcome> {
  const accounts = await ledger.getAccounts();

  const source = await resolveSourceMapping(config, statement, args.bank, accounts, ctx);
  if (!source) {
    throw new UserError(
      `No Actual account mapped for bank account '${statement.sourceAccountNumber}'.\n` +
        `Map it with \`actual-importer map ${statement.sourceAccountNumber} <actual account> --bank ${args.bank}\`,\n` +
        "or run the import in an interactive terminal."
    );
  }

  // Offer unknown counterparty accounts — some may be the user's own.
  if (ctx.interactive) {
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
  result(ctx, formatReport(formatTransfers(plan, accountNames), outcome, args.dryRun), {
    dryRun: args.dryRun,
    file: args.file,
    bank: args.bank,
    account: {
      id: source.actualAccountId,
      name: accountNames.get(source.actualAccountId),
      bankAccountNumber: source.bankAccountNumber,
    },
    outcome,
    transactions: planToJson(plan, accountNames),
  });
  return outcome;
}

/** The mapping for the statement's own account, asking the user if it's new. */
async function resolveSourceMapping(
  config: Config,
  statement: Statement,
  bank: string,
  accounts: LedgerAccount[],
  ctx: CommandContext
): Promise<AccountMapping | undefined> {
  const existing = findMapping(statement.sourceAccountNumber, config.accountMappings);
  if (existing || !ctx.interactive) return existing;
  return promptSourceMapping(config, statement.sourceAccountNumber, bank, accounts);
}
