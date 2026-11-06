# Architecture

actual-importer turns a bank's CSV export into transactions in an Actual Budget
budget. It does this without creating duplicates on re-import, and records
money moved between your own accounts as transfers.

## Layers

```
src/
├── cli.ts               entry point: registers commands, turns errors into exit codes
├── commands/            CLI adapters: args, prompts, console output        ← UI
│   ├── runtime.ts       defineCommand, CommandContext (--json/--no-input), output helpers
│   ├── import.ts  accounts.ts  map.ts  setup.ts
│   └── mapping-prompts.ts
├── import/              the import use case, UI-free                        ← core
│   ├── plan.ts          planImport(): decide an action per transaction (no writes)
│   ├── execute.ts       executePlan() / predictOutcome() (dry run)
│   ├── deduplication.ts imported_id hashing
│   ├── transfer-*.ts    detect transfers, match the other side
│   ├── account-mapping.ts, filter.ts, report.ts
├── parsers/             bank CSV → Statement                                ← core
│   ├── types.ts         BankParser interface
│   ├── registry.ts      list of parsers, lookup, detection
│   ├── shared.ts        decode / readRows / cleanAccountNumber / atRow
│   └── <bank>/index.ts + fixtures/sample.csv
├── ledger/              the budget we write to
│   ├── ledger.ts        Ledger interface (what the core depends on)
│   └── actual.ts        ActualLedger + withBudget() — the only @actual-app/api user
├── config/              connection settings (env/.env/JSON) and account mappings
├── domain/              value logic: account numbers, money, dates, Transaction  ← innermost
├── errors.ts            UserError
└── test-support/        InMemoryLedger (test double, not shipped)
```

Dependencies point inwards: `commands → import/parsers/config → domain`. The
core never imports `commands/`, prompts, yargs or `@actual-app/api`. ESLint
enforces this (`eslint.config.js`), so a violation fails `npm run lint`.

## An import, step by step

```
import --file x.csv [--bank ing]                         commands/import.ts
  │ read file, pick parser (registry.detectParsers if no --bank)
  ▼
parser.parse(bytes) → Statement { sourceAccountNumber, transactions[] }
  │ filterByDate(--from/--to)
  ▼
withBudget(conn, ledger => …)                              ledger/actual.ts
  │ resolve the statement's account (mapping, or prompt / `map` command)
  │ offer frequent unmapped counterparties (interactive only)
  ▼
planImport(input, ledger) → ImportPlan                       import/plan.ts
  │ per transaction: imported_id, cents, and one action:
  │   duplicate  imported_id already in the account
  │   create     regular transaction
  │   transfer   counterparty is a mapped account → payee = transfer payee;
  │              Actual creates the other side
  │   link       other side already in the target account, unlinked
  │              → import this side, then link the two
  │   adopt      this side was auto-created by Actual when the other bank's
  │              statement was imported → mark it imported instead of adding
  ▼
dry run ? predictOutcome(plan) : executePlan(plan, ledger)   import/execute.ts
  ▼
formatReport / planToJson                                    import/report.ts
```

Dry run and real run share the plan, so the dry-run numbers are exactly what a
real run does.

## Invariants

- **`imported_id` stability.** `SHA256(date|amount|description|account)`, with
  `|n` appended for the n-th identical transaction in a statement. Anything
  that changes these inputs for an already-imported transaction (parser
  changes, normalization) makes re-imports create duplicates.
- **Transfers go through transfer payees.** Never write `transfer_id` when
  creating transactions. It is a transaction id, and Actual maintains it. The
  one exception is `Ledger.linkTransfer`, which mirrors what Actual's UI does.
- **Amounts** are currency units (`number`) in `Transaction`, and integer cents
  everywhere from `planImport` on (`toCents`).
- **Account numbers** are compared only via `domain/account-number.ts`
  (spaces, apostrophes and the `PL` prefix are ignored).
- `@actual-app/api` is a process-wide singleton: one `withBudget` at a time.

## Testing

| What | How |
|---|---|
| Domain, dedup, matching | Plain unit tests next to the module |
| Parsers | `parsers/contract.test.ts` runs every registered parser against its `fixtures/sample.csv`; plus `<bank>.test.ts` for specifics |
| Import pipeline | `import/import.test.ts` runs `planImport` + `executePlan` against `InMemoryLedger`, which models Actual's dedup and transfer mirroring and records writes |
| CLI | `commands/commands.test.ts` for pure helpers. Commands themselves are thin; try them with `npx tsx src/cli.ts … --dry-run` |

## Extending

- **New bank:** see CONTRIBUTING.md. It needs a parser directory, a fixture, and one registry line.
- **New command:** add `src/commands/<name>.ts` exporting `defineCommand({...})`,
  then register it in `src/cli.ts`. Throw `UserError` for expected failures,
  use `info()`/`result()` for output so `--json` works, and check
  `ctx.interactive` before prompting.
- **Another budget backend or a different write strategy:** implement `Ledger`.
