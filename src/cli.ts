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
          describe: "Bank identifier (e.g. ing, santander)",
          demandOption: true,
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
