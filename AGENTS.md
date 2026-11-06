# Agent guide

Instructions for AI coding agents (and a quick start for humans). Read
ARCHITECTURE.md for the design and CONTRIBUTING.md for adding a bank.

## What this is

A Node.js + TypeScript CLI that imports CSV exports from Polish banks (ING,
Erste — formerly Santander) into a self-hosted Actual Budget via
`@actual-app/api`. It detects transfers between your own accounts and
deduplicates through a hashed `imported_id`.

CLI surface (`npx tsx src/cli.ts <command> --help` for details):

- `setup`: interactive connection wizard (server, password, budget picker, E2E password)
- `import --file <csv> [--bank ing|erste] [--from/--to YYYY-MM-DD] [--dry-run] [--json]`
- `accounts [--json]`: Actual accounts and the bank accounts mapped to them
- `map <bank-account> [<actual account>] [--bank] [--ignore] [--remove]`: non-interactive mapping
- global `--no-input`; `DEBUG=1` prints stack traces

Bank formats: ING is CP1250 with `;` and a metadata block before the data;
Erste is UTF-8 with `,` and a metadata first row.

## Commands

```bash
npm run check                  # lint + typecheck (incl. tests) + tests — must pass before committing
npm test -- src/import         # run a subset of tests
npx tsx src/cli.ts --help      # run the CLI from source
npm run build                  # emit dist/ (tsconfig.build.json)
```

## Map of the code

| You want to… | Look at |
|---|---|
| Change how a transaction is classified (transfer/link/adopt/…) | `src/import/plan.ts`, `src/import/transfer-matcher.ts` |
| Change what gets written | `src/import/execute.ts` |
| Change output / JSON shape | `src/import/report.ts` |
| Fix or add a bank | `src/parsers/<bank>/`, `CONTRIBUTING.md` |
| Add/modify a CLI command or flag | `src/commands/<name>.ts` (`defineCommand`), register in `src/cli.ts` |
| Talk to Actual differently | `src/ledger/ledger.ts` (interface) + `src/ledger/actual.ts` |
| Config / env vars | `src/config/config.ts` (`ENV`), `.env.example` |
| Account numbers, money, dates | `src/domain/` |

## Rules

- **Don't change the inputs of `imported_id`** (`src/import/deduplication.ts`,
  and what parsers return for date/amount/description). If you do, re-importing
  a file creates duplicates in users' budgets.
- **Never write `transfer_id` when creating transactions.** Use the target
  account's transfer payee as `payee`. Only `Ledger.linkTransfer` sets it.
- **Layering is linted.** Core code (`domain`, `parsers`, `import`, `config`)
  must not import `commands/`, prompts, yargs, `@actual-app/api` or
  `ledger/actual.ts`. Depend on the `Ledger` interface and test with
  `InMemoryLedger` (`src/test-support/`).
- **Commands don't call `process.exit`.** Throw `UserError`. Print through
  `info()`/`result()` from `commands/runtime.ts` so `--json` stays valid. Only
  prompt when `ctx.interactive`.
- Amounts are integer cents once they leave the parser (`toCents`).
- Tests sit next to the code (`foo.ts` → `foo.test.ts`). Add a test for every
  behaviour change. Pipeline behaviour belongs in `src/import/import.test.ts`.
- `npm run check` must pass.

## Running against a real budget

Connection settings come from env vars or `.env` (see `.env.example`), or from
`~/.actual-importer/config.json`. Always use `--dry-run` first. It connects
but writes nothing, and `--json` makes its result easy to inspect:

```bash
npx tsx src/cli.ts import --file export.csv --dry-run --json
```

Don't run a real import, `map`, or anything else that writes to a user's
budget or config unless the user asked for it.
