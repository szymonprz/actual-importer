import { readFile } from "node:fs/promises";
import { loadConfig, type Config } from "../config/config.js";
import {
  findMapping,
  findUnmappedCounterparties,
} from "../services/account-mapping.js";
import { canPrompt, promptCounterpartyMappings, promptSourceMapping } from "./mapping-prompts.js";
import { getParser, getAvailableBankIds } from "../parsers/registry.js";
import { computeImportedId } from "../services/deduplication.js";
import { detectTransfer } from "../services/transfer-detector.js";
import {
  connect,
  disconnect,
  getAccounts,
  getTransferPayees,
  findTransactions,
  findByImportedIds,
  importTransactions,
  linkTransfer,
  updateTransaction,
  amountToInteger,
} from "../services/actual.js";
import type {
  ActualTransaction,
  ExistingTransaction,
} from "../services/actual.js";
import {
  pickCounterpart,
  shiftDate,
  TRANSFER_DATE_WINDOW_DAYS,
} from "../services/transfer-matcher.js";
import {
  createEmptySummary,
  formatSummary,
  type ImportSummary,
} from "../utils/summary.js";

interface ImportArgs {
  file: string;
  bank: string;
  dryRun: boolean;
  from?: string;
  to?: string;
}

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

  const total = parsed.transactions.length;
  parsed.transactions = parsed.transactions.filter(
    (tx) =>
      (!args.from || tx.date >= args.from) && (!args.to || tx.date <= args.to)
  );
  if (parsed.transactions.length < total) {
    console.log(
      `Date filter: importing ${parsed.transactions.length} of ${total} transactions.`
    );
  }

  if (parsed.transactions.length === 0) {
    console.log(formatSummary(createEmptySummary(), args.dryRun));
    return;
  }

  const summary: ImportSummary = createEmptySummary();

  try {
    // Connect in dry-run too: it's read-only and lets us report exactly what
    // would be skipped, and which transfers would be linked vs. created.
    await connect(config);

    const accounts = await getAccounts();
    const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
    const accountIds = new Set(accountNames.keys());
    const transferPayees = await getTransferPayees();

    // Map the CSV's own account, asking the user if it's new.
    const sourceAccountNumber = parsed.sourceAccountNumber;
    let sourceMapping = findMapping(sourceAccountNumber, config.accountMappings);
    if (!sourceMapping && canPrompt()) {
      sourceMapping = await promptSourceMapping(
        config,
        sourceAccountNumber,
        args.bank,
        accounts
      );
    }
    if (!sourceMapping) {
      console.error(
        `No Actual account mapped for bank account '${sourceAccountNumber}'.\n` +
          "Run the import in an interactive terminal to map it."
      );
      process.exitCode = 1;
      return;
    }
    const sourceAccountId = sourceMapping.actualAccountId;
    const sourceBankAccountNumber = sourceMapping.bankAccountNumber;

    // Offer unknown counterparty accounts — some may be the user's own.
    if (canPrompt()) {
      await promptCounterpartyMappings(
        config,
        findUnmappedCounterparties(
          parsed.transactions,
          sourceAccountNumber,
          config.accountMappings,
          config.ignoredCounterparties ?? [],
          2 // one-off payees are almost never your own accounts
        ),
        accounts,
        12
      );
    }

    const planned = parsed.transactions.map((tx) => ({
      tx,
      importedId: computeImportedId(
        tx.date,
        tx.amount,
        tx.description,
        sourceBankAccountNumber
      ),
      amount: amountToInteger(tx.amount),
      transfer: detectTransfer(tx, config.accountMappings),
    }));

    const alreadyImported = await findByImportedIds(
      sourceAccountId,
      planned.map((p) => p.importedId)
    );

    const actualTransactions: ActualTransaction[] = [];
    // imported_id of the new transaction -> existing transaction to link it to
    const pendingLinks = new Map<string, ExistingTransaction>();
    const claimed = new Set<string>();
    const transferLines: string[] = [];
    const adoptions: Array<{ id: string; tx: ActualTransaction }> = [];

    for (const p of planned) {
      const actualTx: ActualTransaction = {
        date: p.tx.date,
        amount: p.amount,
        imported_payee: p.tx.payee || undefined,
        notes: p.tx.description || undefined,
        imported_id: p.importedId,
        cleared: true,
      };
      const isNew = !alreadyImported.has(p.importedId);
      const target = p.transfer.targetActualAccountId;

      if (p.transfer.isTransfer && target && target !== sourceAccountId) {
        if (isNew) summary.transfers++;
        const label = `${p.tx.date}  ${(p.amount / 100).toFixed(2).padStart(10)}  → ${accountNames.get(target) ?? target}`;

        // The transfer may already exist on this side, auto-created by Actual
        // when the other bank's CSV was imported. Adopt it instead of adding
        // a duplicate.
        const autoCreated = isNew
          ? (
              await findTransactions({
                account: sourceAccountId,
                amount: p.amount,
                dateFrom: shiftDate(p.tx.date, -TRANSFER_DATE_WINDOW_DAYS),
                dateTo: shiftDate(p.tx.date, TRANSFER_DATE_WINDOW_DAYS),
              })
            ).find(
              (t) =>
                t.imported_id === null &&
                t.transfer_id !== null &&
                !accountIds.has(t.transfer_id) &&
                !claimed.has(t.id)
            )
          : undefined;
        if (autoCreated) {
          claimed.add(autoCreated.id);
          adoptions.push({ id: autoCreated.id, tx: actualTx });
          transferLines.push(`  ${label}  already in Actual (${autoCreated.date}), marking as imported`);
          continue;
        }

        const counterpart = isNew
          ? pickCounterpart(
              { date: p.tx.date, amount: p.amount },
              await findTransactions({
                account: target,
                amount: -p.amount,
                dateFrom: shiftDate(p.tx.date, -TRANSFER_DATE_WINDOW_DAYS),
                dateTo: shiftDate(p.tx.date, TRANSFER_DATE_WINDOW_DAYS),
              }),
              claimed,
              accountIds
            )
          : undefined;

        if (counterpart) {
          // The other side is already in Actual (e.g. imported from the other
          // bank's CSV). Import this one without a payee, then link the two.
          claimed.add(counterpart.id);
          pendingLinks.set(p.importedId, counterpart);
          transferLines.push(`  ${label}  link to existing (${counterpart.date})`);
        } else {
          // Actual creates the other side automatically for transfer payees.
          actualTx.payee = transferPayees.get(target);
          if (isNew) transferLines.push(`  ${label}  new transfer`);
        }
      } else {
        actualTx.payee_name = p.tx.payee || undefined;
      }

      actualTransactions.push(actualTx);
    }

    if (args.dryRun) {
      summary.skipped = alreadyImported.size + adoptions.length;
      summary.imported = actualTransactions.length - alreadyImported.size;
      printTransfers(transferLines);
      console.log(formatSummary(summary, true));
      return;
    }

    for (const { id, tx } of adoptions) {
      await updateTransaction(id, {
        imported_id: tx.imported_id,
        imported_payee: tx.imported_payee,
        cleared: true,
      });
      summary.skipped++;
    }

    const result = await importTransactions(sourceAccountId, actualTransactions);
    summary.imported += result.added.length;
    summary.skipped += actualTransactions.length - result.added.length;
    for (const error of result.errors) {
      summary.errors.push(error.message);
    }

    if (pendingLinks.size > 0) {
      const added = new Set(result.added);
      const newIds = await findByImportedIds(sourceAccountId, [
        ...pendingLinks.keys(),
      ]);
      for (const [importedId, counterpart] of pendingLinks) {
        const id = newIds.get(importedId);
        if (!id || !added.has(id)) continue;
        try {
          await linkTransfer(
            { id: counterpart.id, account: counterpart.account },
            { id, account: sourceAccountId },
            transferPayees
          );
        } catch (error) {
          summary.errors.push(
            `Failed to link transfer ${importedId.slice(0, 8)}: ${error instanceof Error ? error.message : error}`
          );
        }
      }
    }

    printTransfers(transferLines);
    console.log(formatSummary(summary, false));
  } catch (error) {
    console.error(
      "Failed to import transactions:",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
}

function printTransfers(lines: string[]): void {
  if (lines.length === 0) return;
  console.log("Transfers:");
  for (const line of lines) console.log(line);
  console.log("");
}
