# Contributing

```bash
npm install
npm run check   # lint + typecheck (including tests) + tests — run before every commit
```

Tests sit next to the code they cover (`foo.ts` → `foo.test.ts`).

## Adding a bank

A bank is one directory under `src/parsers/` plus one line in the registry. No
other code needs to change.

### 1. Add a sample export

Put a small, **anonymized** export at `src/parsers/<bankId>/fixtures/sample.csv`
(5–10 transactions; replace names and account numbers with fake ones, but keep
the exact layout, encoding and quoting of the real file). Include at least one
transfer to another account if the bank provides counterparty account numbers.

### 2. Write the parser

```typescript
// src/parsers/mybank/index.ts
import { isIsoDate } from "../../domain/dates.js";
import { parseDecimalAmount } from "../../domain/money.js";
import type { BankParser, ParseResult } from "../types.js";
import { atRow, cleanAccountNumber, decode, readRows } from "../shared.js";

export class MyBankParser implements BankParser {
  bankId = "mybank";            // value of --bank
  displayName = "My Bank";
  aliases = ["mybank-old-name"]; // optional

  // Cheap, specific check used when --bank is omitted.
  // Must not match other banks' files (the contract test checks this).
  detect(content: Buffer): boolean {
    return decode(content.subarray(0, 1024)).startsWith("Date;Amount;");
  }

  parse(content: string | Buffer): ParseResult {
    const rows = readRows(decode(content, "utf-8"), ";");
    return {
      sourceAccountNumber: cleanAccountNumber(rows[0][1]) ?? "",
      transactions: rows.slice(1).map((row, i) =>
        atRow("MyBank", i + 1, () => ({
          date: row[0],                          // YYYY-MM-DD
          amount: parseDecimalAmount(row[1]),    // negative = expense
          payee: row[2].trim(),
          description: row[3].trim(),
          counterpartyAccount: cleanAccountNumber(row[4]), // enables transfers
        }))
      ),
    };
  }
}
```

Helpers you'll likely want:

| Helper | Where | What it does |
|---|---|---|
| `decode(content, encoding)` | `parsers/shared.ts` | Bytes → string (e.g. `"cp1250"`), strips a BOM |
| `readRows(text, delimiter)` | `parsers/shared.ts` | CSV → `string[][]` |
| `cleanAccountNumber(cell)` | `parsers/shared.ts` | `"'PL10 1050 …"` → `"101050…"`, empty → `undefined` |
| `atRow(bank, n, fn)` | `parsers/shared.ts` | Prefixes errors with the row number |
| `parseDecimalAmount(s)` | `domain/money.ts` | `"-1 234,56"` → `-1234.56`; throws on garbage |
| `isIsoDate(s)` | `domain/dates.ts` | Validate `YYYY-MM-DD` |

### 3. Register it

```typescript
// src/parsers/registry.ts
import { MyBankParser } from "./mybank/index.js";

export const parsers = [new IngParser(), new ErsteParser(), new MyBankParser()];
```

### 4. Test

`src/parsers/contract.test.ts` automatically checks every registered parser
against its `fixtures/sample.csv`: that `detect` recognises it and no other
parser does, and that every transaction has an ISO date, a finite non-zero
amount, trimmed strings and a clean counterparty account. Add a
`mybank.test.ts` for anything bank-specific: exact values, skipped rows
(pending, blocked), the source account.

Then try it against your budget without writing anything:

```bash
npx tsx src/cli.ts import --file real-export.csv --dry-run
```

## Rules that keep imports safe

- **Never change what feeds `imported_id`** (`src/import/deduplication.ts`). The
  date, amount, description and account number a parser produces for a
  transaction must stay the same across versions. Otherwise re-importing a file
  creates duplicates.
- **Never write `transfer_id` directly** when creating transactions. Create
  transfers by setting `payee` to the target account's transfer payee. See
  `src/import/plan.ts`.
- Import logic must depend on the `Ledger` interface (`src/ledger/ledger.ts`),
  not on `@actual-app/api`, so it can be tested with `InMemoryLedger`.
