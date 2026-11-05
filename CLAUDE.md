# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

actual-importer is a CLI tool (Node.js + TypeScript) that imports bank transaction history from Polish banks (ING, Erste — formerly Santander) into a self-hosted Actual Budget instance. It handles CSV parsing, inter-account transfer detection, deduplication via SHA-256 hashed `imported_id`, and persists results via the `@actual-app/api` SDK.

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **CLI framework:** yargs (command routing and --help)
- **Interactive prompts:** @clack/prompts (setup wizard)
- **Actual Budget SDK:** @actual-app/api
- **Config:** connection from env vars / `.env` (see `.env.example`), falling back to `~/.actual-importer/config.json`; account mappings always in the JSON file (`ACTUAL_IMPORTER_CONFIG` overrides its path)

## Architecture

### CLI Commands

- `setup` — interactive wizard for the connection (server URL, password, budget picked from a list, E2E password); saves to the JSON config or `./.env`
- `import --file <path> --bank <id> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]` — parse CSV, detect transfers, deduplicate, and import. Prompts (TTY only) to map an unmapped source account and frequent unmapped counterparty accounts
- `accounts` — list Actual Budget accounts from the configured budget

### Bank Parser Interface

Parsers live in `src/parsers/<bankId>/` and implement the `BankParser` interface. Adding a new bank requires only creating a new parser directory — no core logic changes needed.

```typescript
interface BankParser {
  bankId: string;
  parse(csvContent: string | Buffer): Transaction[];
}
```

Adding a new parser also requires registering it in `src/parsers/registry.ts` (2 lines: import + `register()` call).

### Key Domain Logic

- **Transfer detection:** if a transaction's `counterpartyAccount` matches a configured `bankAccountNumber`, it becomes an Actual Budget transfer. Transfers are created by setting `payee` to the target account's transfer payee — never write `transfer_id` directly (it's a transaction id, not an account id). If the other side already exists unlinked in the target account, the importer links the two (`src/services/transfer-matcher.ts`)
- **Deduplication:** `imported_id = SHA256(date + "|" + amount + "|" + description + "|" + bankAccountNumber)`; the 2nd, 3rd… identical transaction in a statement appends `"|" + occurrence` (`computeImportedIds`), so same-day duplicates like two ATM withdrawals stay distinct while first-occurrence IDs never change
- **Dry-run:** executes all logic except API writes; summary prefixed with `[DRY RUN]`

### Actual Budget API

- Amounts are in **integer cents** (e.g. $12.30 = 1230). Use `amountToInteger()` from `src/services/actual.ts`.
- `importTransactions()` returns `{ added, updated, errors }` — deduplication is handled by Actual via `imported_id`.
- ING CSVs are CP1250-encoded and use semicolons as delimiters. Erste (formerly Santander) CSVs are UTF-8 with comma delimiters.

## Build & Development Commands

```bash
npm install          # install dependencies
npm run build        # compile TypeScript (tsc)
npm test             # run tests (vitest)
npm run lint         # lint code (eslint)
npx tsx src/cli.ts   # run CLI without building
```

## PRD

The full product requirements document is at `.ai/prd.md`.
