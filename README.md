# actual-importer

CLI tool to import bank transaction history from Polish banks into [Actual Budget](https://actualbudget.org/).

## Supported Banks

- **ING Bank Śląski** — CSV exports (CP1250 encoding)
- **Erste Bank Polska** (formerly Santander Bank Polska) — CSV exports (UTF-8). `--bank santander` still works.

## Features

- Interactive setup wizard for configuring Actual Budget connection
- Automatic transfer detection between your own accounts
- Deduplication — re-importing the same CSV won't create duplicates
- Dry-run mode to preview imports before writing data
- Extensible parser architecture for adding new banks

## Requirements

- Node.js >= 22.12
- A self-hosted [Actual Budget](https://actualbudget.org/) server

## Installation

```bash
npm install -g actual-importer
```

Or run directly with npx:

```bash
npx actual-importer
```

## Usage

### 1. Connect to Actual

The importer needs four settings. Pick whichever way suits you:

**Option A — `.env` file** (handy when working from this repo):

```bash
cp .env.example .env   # then fill in the values
```

**Option B — setup wizard:**

```bash
actual-importer setup
```

It logs in, lets you pick the budget from a list (no need to look up the sync ID),
asks for the encryption password only if the budget is encrypted, checks that the
budget opens, and saves either to `~/.actual-importer/config.json` or to `./.env`.
Re-running it pre-fills your current values.

| Setting | Env var | Where to find it |
|---|---|---|
| Server URL | `ACTUAL_SERVER_URL` | Your Actual server address |
| Password | `ACTUAL_PASSWORD` | The password you log into Actual with |
| Budget sync ID | `ACTUAL_BUDGET_ID` | Actual → Settings → Show advanced settings → Sync ID |
| Encryption password | `ACTUAL_E2E_PASSWORD` | Only if end-to-end encryption is on |

Precedence: real environment variables → `.env` in the current directory → `~/.actual-importer/config.json`.

Account mappings (which bank account is which Actual account) always live in the
JSON config file — set `ACTUAL_IMPORTER_CONFIG` to use a different path. Secrets
from `.env` are never copied into it.

The budget is downloaded to `~/.actual-importer/cache` (readable only by you,
since it is a full decrypted copy) on each run; set `ACTUAL_IMPORTER_DATA_DIR`
to put it elsewhere. Versions before this one cached it in
`/tmp/actual-importer-data`, which you can delete.

### 2. Import transactions

Export a CSV from your bank's online portal, then:

```bash
actual-importer import --file ~/Downloads/Lista_transakcji_ING.csv --bank ing
```

```bash
actual-importer import --file ~/Downloads/historia_erste.csv --bank erste
```

`--bank` can be left out: the bank is recognised from the file's layout.

The first time you import a CSV from a new bank account, you're asked which Actual
account it belongs to. You're also shown bank accounts you've sent money to or
received money from at least twice: mark the ones that are yours (a spouse's
account, a joint account, savings) and money moving between them is recorded as
a transfer. The rest are remembered so you're not asked again. In a
non-interactive shell (or with `--no-input` / `--json`), an unmapped source
account is an error; map it with `actual-importer map` first.

#### Date range

Skip transactions outside a range, e.g. history from before your budget's start date:

```bash
actual-importer import --file transactions.csv --bank ing --from 2026-01-01
```

`--to` works the same way. Both dates are inclusive.

#### Dry-run mode

Preview what would be imported without writing to Actual Budget:

```bash
actual-importer import --file transactions.csv --bank ing --dry-run
```

#### Scripting and automation

`--json` prints a single JSON document on stdout (progress messages go to stderr)
and never prompts. It contains the outcome counts and one entry per transaction,
with what happened to it (`create`, `duplicate`, `transfer`, `link`, `adopt`):

```bash
actual-importer import --file transactions.csv --bank ing --dry-run --json | jq .outcome
```

The exit code is non-zero when anything failed. `--no-input` turns off prompts
without changing the output.

### 3. List accounts

View your Actual Budget accounts and the bank accounts mapped to them:

```bash
actual-importer accounts          # add --json for machine-readable output
```

### 4. Map accounts without prompts

```bash
# This bank account is the Actual account "ING Main" (account name or id)
actual-importer map "10 1050 1461 1000 0097 0488 6994" "ING Main" --bank ing

# This counterparty is not one of mine; stop asking about it
actual-importer map 20105014611000009704889326 --ignore

# Forget a mapping or ignore entry
actual-importer map 20105014611000009704889326 --remove
```

## How it works

### Transfer detection

When a transaction's counterparty account matches one of your mapped bank accounts, it's recorded as an Actual Budget transfer instead of a standalone expense/income.

If both sides get imported (e.g. you import both the ING and the Erste CSV), the transfer is still recorded once: when the other side already exists in Actual (opposite amount, within ±3 days), the two are linked instead of creating a duplicate.

Only map accounts that exist in your Actual budget. Money sent to someone whose account you don't track (e.g. a partner's personal account outside the budget) should stay a regular expense/income.

### Deduplication

Each transaction gets a unique `imported_id` computed as `SHA256(date|amount|description|bankAccountNumber)`. Identical transactions on the same day (e.g. two ATM withdrawals of the same amount) get an occurrence number appended, so they aren't merged. Actual Budget skips transactions with previously seen IDs, so re-importing the same CSV is safe.

## Development

```bash
npm install
npm run check     # Lint + typecheck + tests (run before committing)
npm run build     # Compile TypeScript
npm test          # Run tests
npm run dev       # Run CLI via tsx (no build needed)
```

Set `DEBUG=1` to get stack traces for unexpected errors.

Run a command during development:

```bash
npx tsx src/cli.ts import --file sample.csv --bank ing --dry-run
```
