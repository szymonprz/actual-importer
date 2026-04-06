import { readFile } from "node:fs/promises";
import { configExists, loadConfig } from "../config/config.js";
import { getParser, getAvailableBankIds } from "../parsers/registry.js";
import { computeImportedId } from "../services/deduplication.js";
import { detectTransfer } from "../services/transfer-detector.js";
import {
  connect,
  disconnect,
  importTransactions,
  amountToInteger,
} from "../services/actual.js";
import type { ActualTransaction } from "../services/actual.js";
import {
  createEmptySummary,
  formatSummary,
  type ImportSummary,
} from "../utils/summary.js";

interface ImportArgs {
  file: string;
  bank: string;
  dryRun: boolean;
}

export async function importCommand(args: ImportArgs): Promise<void> {
  if (!configExists()) {
    console.error(
      "Configuration not found. Run `actual-importer setup` first."
    );
    process.exit(1);
  }

  const parser = getParser(args.bank);
  if (!parser) {
    console.error(
      `Unknown bank: '${args.bank}'. Available banks: ${getAvailableBankIds().join(", ")}`
    );
    process.exit(1);
  }

  const config = await loadConfig();

  // Find the account mapping for this bank
  const sourceMapping = config.accountMappings.find(
    (m) => m.bank === args.bank
  );
  if (!sourceMapping) {
    console.error(
      `No account mapping found for bank '${args.bank}'. Run \`actual-importer setup\` to configure.`
    );
    process.exit(1);
  }

  // Read CSV file
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

  // Parse transactions
  let parsed;
  try {
    parsed = parser.parse(csvData);
  } catch (error) {
    console.error(
      `Failed to parse CSV with ${args.bank} parser:`,
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }

  if (parsed.length === 0) {
    console.log(formatSummary(createEmptySummary(), args.dryRun));
    return;
  }

  // Build Actual transactions
  const summary: ImportSummary = createEmptySummary();
  const transactionsByAccount = new Map<string, ActualTransaction[]>();

  for (const tx of parsed) {
    const importedId = computeImportedId(
      tx.date,
      tx.amount,
      tx.description,
      sourceMapping.bankAccountNumber
    );

    const transfer = detectTransfer(tx, config.accountMappings);

    const actualTx: ActualTransaction = {
      date: tx.date,
      amount: amountToInteger(tx.amount),
      payee_name: tx.payee || undefined,
      imported_payee: tx.payee || undefined,
      notes: tx.description || undefined,
      imported_id: importedId,
      cleared: true,
    };

    if (transfer.isTransfer && transfer.targetActualAccountId) {
      actualTx.transfer_id = transfer.targetActualAccountId;
      summary.transfers++;
    }

    const accountId = sourceMapping.actualAccountId;
    if (!transactionsByAccount.has(accountId)) {
      transactionsByAccount.set(accountId, []);
    }
    transactionsByAccount.get(accountId)!.push(actualTx);
  }

  if (args.dryRun) {
    summary.imported = parsed.length;
    console.log(formatSummary(summary, true));
    return;
  }

  // Import to Actual Budget
  try {
    await connect(config);

    for (const [accountId, transactions] of transactionsByAccount) {
      const result = await importTransactions(accountId, transactions);
      summary.imported += result.added.length;
      summary.skipped += transactions.length - result.added.length;
      for (const error of result.errors) {
        summary.errors.push(error.message);
      }
    }

    console.log(formatSummary(summary, false));
  } catch (error) {
    console.error(
      "Failed to import transactions:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    await disconnect();
  }
}
