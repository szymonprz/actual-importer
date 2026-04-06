# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

actual-importer is a CLI tool (Node.js + TypeScript) that imports bank transaction history from Polish banks (ING, Santander) into a self-hosted Actual Budget instance. It handles CSV parsing, inter-account transfer detection, deduplication via SHA-256 hashed `imported_id`, and persists results via the `@actual-app/api` SDK.

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **CLI framework:** yargs (command routing and --help)
- **Interactive prompts:** @clack/prompts (setup wizard)
- **Actual Budget SDK:** @actual-app/api
- **Config:** `~/.actual-importer/config.json` (plain JSON, local-only)

## Architecture

### CLI Commands

- `setup` — interactive wizard to configure server URL, API password, budget ID, and account mappings
- `import --file <path> --bank <id> [--dry-run]` — parse CSV, detect transfers, deduplicate, and import
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

- **Transfer detection:** if a transaction's `counterpartyAccount` matches a configured `bankAccountNumber`, it becomes an Actual Budget transfer between mapped accounts
- **Deduplication:** `imported_id = SHA256(date + "|" + amount + "|" + description + "|" + bankAccountNumber)`
- **Dry-run:** executes all logic except API writes; summary prefixed with `[DRY RUN]`

### Actual Budget API

- Amounts are in **integer cents** (e.g. $12.30 = 1230). Use `amountToInteger()` from `src/services/actual.ts`.
- `importTransactions()` returns `{ added, updated, errors }` — deduplication is handled by Actual via `imported_id`.
- ING CSVs are CP1250-encoded and use semicolons as delimiters. Santander CSVs are UTF-8 with comma delimiters.

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
