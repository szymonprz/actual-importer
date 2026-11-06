import {
  loadConfig,
  readConfigFile,
  saveMappings,
  withMapping,
  withoutMapping,
} from "../config/config.js";
import { formatAccountNumber, normalizeAccountNumber, sameAccount } from "../domain/account-number.js";
import { withBudget } from "../ledger/actual.js";
import type { LedgerAccount } from "../ledger/ledger.js";
import { getAvailableBankIds } from "../parsers/registry.js";
import { createContext, defineCommand, info, UserError } from "./runtime.js";

/** Find an Actual account by id or (case-insensitive) name. */
export function resolveAccount(
  accounts: LedgerAccount[],
  idOrName: string
): LedgerAccount {
  const wanted = idOrName.trim().toLowerCase();
  const match =
    accounts.find((a) => a.id === idOrName) ??
    accounts.find((a) => a.name.toLowerCase() === wanted);
  if (!match) {
    throw new UserError(
      `No Actual account '${idOrName}'. Accounts: ${accounts.map((a) => a.name).join(", ")}`
    );
  }
  return match;
}

export const mapCommand = defineCommand({
  command: "map <bank-account> [actual-account]",
  describe:
    "Map a bank account number to an Actual account (non-interactive alternative to the import prompts)",
  builder: (yargs) =>
    yargs
      .positional("bank-account", {
        type: "string",
        describe: "Bank account number (spaces and PL prefix are fine)",
        demandOption: true,
      })
      .positional("actual-account", {
        type: "string",
        describe: "Actual account id or name",
      })
      .option("bank", {
        type: "string",
        describe: `Bank of this account (${getAvailableBankIds().join(", ")}); informational`,
      })
      .option("ignore", {
        type: "boolean",
        describe: "Mark as not one of your accounts, so import stops asking about it",
      })
      .option("remove", {
        type: "boolean",
        describe: "Remove the mapping / ignore entry for this bank account",
      })
      .check((argv) => {
        const modes = [argv.actualAccount !== undefined, argv.ignore, argv.remove].filter(Boolean);
        if (modes.length !== 1) {
          return "Pass exactly one of: <actual-account>, --ignore, --remove";
        }
        return true;
      })
      .example("$0 map '10 1050 1461 1000 0097 0488 6994' 'ING Main' --bank ing", "")
      .example("$0 map 20105014611000009704889326 --ignore", ""),
  handler: async (argv) => {
    const ctx = createContext(argv);
    const number = normalizeAccountNumber(argv.bankAccount);
    const label = formatAccountNumber(number);
    // --ignore / --remove only touch the config file; no server needed.
    const file = await readConfigFile();
    let mappings = withoutMapping(file.accountMappings ?? [], number);
    let ignored = (file.ignoredCounterparties ?? []).filter((n) => !sameAccount(n, number));

    if (argv.remove) {
      info(ctx, `Removed mapping for ${label}.`);
    } else if (argv.ignore) {
      ignored = [...ignored, number];
      info(ctx, `${label} will be treated as someone else's account.`);
    } else {
      const config = await loadConfig();
      const accounts = await withBudget(config, (ledger) => ledger.getAccounts());
      const account = resolveAccount(accounts, argv.actualAccount!);
      mappings = withMapping(mappings, {
        bankAccountNumber: number,
        actualAccountId: account.id,
        ...(argv.bank ? { bank: argv.bank } : {}),
      });
      info(ctx, `${label} → ${account.name}`);
    }

    await saveMappings({ accountMappings: mappings, ignoredCounterparties: ignored });
  },
});
