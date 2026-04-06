# actual-importer

CLI tool to import bank transaction history from Polish banks into [Actual Budget](https://actualbudget.org/).

## Supported Banks

- **ING Bank Śląski** — CSV exports (CP1250 encoding)
- **Santander Bank Polska** — CSV exports (UTF-8)

## Features

- Interactive setup wizard for configuring Actual Budget connection
- Automatic transfer detection between your own accounts
- Deduplication — re-importing the same CSV won't create duplicates
- Dry-run mode to preview imports before writing data
- Extensible parser architecture for adding new banks

## Requirements

- Node.js >= 18
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

### 1. Setup

Run the interactive setup wizard to configure your Actual Budget server and map bank accounts:

```bash
actual-importer setup
```

The wizard will:
1. Ask for your Actual Budget server URL, API password, and budget ID
2. Connect and fetch your accounts
3. Let you map bank account numbers to Actual Budget accounts

Configuration is saved to `~/.actual-importer/config.json`.

### 2. Import transactions

Export a CSV from your bank's online portal, then:

```bash
actual-importer import --file ~/Downloads/Lista_transakcji_ING.csv --bank ing
```

```bash
actual-importer import --file ~/Downloads/historia_santander.csv --bank santander
```

#### Dry-run mode

Preview what would be imported without writing to Actual Budget:

```bash
actual-importer import --file transactions.csv --bank ing --dry-run
```

### 3. List accounts

View available Actual Budget accounts:

```bash
actual-importer accounts
```

## How it works

### Transfer detection

When a transaction's counterparty account matches one of your configured bank accounts, it's automatically recorded as an Actual Budget transfer instead of a standalone expense/income.

### Deduplication

Each transaction gets a unique `imported_id` computed as `SHA256(date|amount|description|bankAccountNumber)`. Actual Budget skips transactions with previously seen IDs, so re-importing the same CSV is safe.

## Development

```bash
npm install
npm run build     # Compile TypeScript
npm test          # Run tests
npm run dev       # Run CLI via tsx (no build needed)
```

Run a command during development:

```bash
npx tsx src/cli.ts import --file sample.csv --bank ing --dry-run
```
