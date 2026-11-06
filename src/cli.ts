#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { setupCommand } from "./commands/setup.js";
import { importCommand } from "./commands/import.js";
import { accountsCommand } from "./commands/accounts.js";

yargs(hideBin(process.argv))
  .scriptName("actual-importer")
  .command(
    "setup",
    "Configure Actual Budget connection and account mappings",
    {},
    async () => {
      await setupCommand();
    }
  )
  .command(
    "import",
    "Import transactions from a bank CSV file",
    (yargs) =>
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
          describe: "Bank identifier (e.g. ing, erste)",
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
        .check((argv) => {
          for (const key of ["from", "to"] as const) {
            const v = argv[key];
            if (v !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
              throw new Error(`--${key} must be a date in YYYY-MM-DD format`);
            }
          }
          return true;
        })
        .option("dry-run", {
          type: "boolean",
          describe: "Preview import without writing to Actual Budget",
          default: false,
        }),
    async (argv) => {
      await importCommand({
        file: argv.file,
        bank: argv.bank,
        dryRun: argv.dryRun,
        from: argv.from,
        to: argv.to,
      });
    }
  )
  .command("accounts", "List Actual Budget accounts", {}, async () => {
    await accountsCommand();
  })
  .demandCommand(1, "Please specify a command")
  .strict()
  .help()
  .parse();
