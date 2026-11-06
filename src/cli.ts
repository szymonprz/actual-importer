#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { accountsCommand } from "./commands/accounts.js";
import { importCommand } from "./commands/import.js";
import { mapCommand } from "./commands/map.js";
import { setupCommand } from "./commands/setup.js";
import { errorMessage, UserError } from "./commands/runtime.js";

try {
  await yargs(hideBin(process.argv))
    .scriptName("actual-importer")
    .option("input", {
      type: "boolean",
      default: true,
      describe: "Allow interactive prompts (--no-input to disable)",
    })
    // Each command lives in src/commands/<name>.ts (see defineCommand).
    .command(setupCommand)
    .command(importCommand)
    .command(accountsCommand)
    .command(mapCommand)
    .demandCommand(1, "Please specify a command")
    .strict()
    .help()
    .fail((message, error, y) => {
      // Errors thrown by handlers are reported below. Anything else is an
      // argument problem (including messages returned from .check()).
      if (error instanceof Error) throw error;
      y.showHelp();
      console.error(`\n${message}`);
      process.exit(1);
    })
    .parseAsync();
} catch (error) {
  if (error instanceof UserError) {
    if (error.message) console.error(error.message);
    process.exitCode = error.exitCode;
  } else {
    console.error(
      process.env.DEBUG && error instanceof Error && error.stack
        ? error.stack
        : `Error: ${errorMessage(error)}`
    );
    process.exitCode = 1;
  }
}
