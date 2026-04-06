# Contributing a new bank parser

actual-importer is designed to make adding new bank parsers straightforward.

## Steps

### 1. Create the parser

Create a new directory under `src/parsers/<bankId>/` with an `index.ts` file:

```typescript
// src/parsers/mybank/index.ts
import { parse } from "csv-parse/sync";
import type { BankParser, Transaction } from "../types.js";

export class MyBankParser implements BankParser {
  bankId = "mybank";

  parse(csvContent: string | Buffer): Transaction[] {
    const content =
      typeof csvContent === "string"
        ? csvContent
        : csvContent.toString("utf-8");

    // Parse CSV and map to Transaction[]
    const records = parse(content, {
      delimiter: ",",
      skip_empty_lines: true,
    }) as string[][];

    return records.map((row) => ({
      date: row[0], // Must be YYYY-MM-DD
      amount: parseFloat(row[1]), // Negative = expense
      payee: row[2],
      description: row[3],
      counterpartyAccount: row[4] || undefined,
    }));
  }
}
```

The `Transaction` interface:

```typescript
interface Transaction {
  date: string;           // YYYY-MM-DD
  amount: number;         // negative = expense, positive = income
  payee: string;
  description: string;
  counterpartyAccount?: string;  // enables transfer detection
}
```

### 2. Register the parser

Edit `src/parsers/registry.ts` — add two lines:

```typescript
import { MyBankParser } from "./mybank/index.js";
// ...
register(new MyBankParser());
```

### 3. Add tests

Create a test file and CSV fixture:

- `src/__tests__/fixtures/mybank-sample.csv` — a small sample CSV (5-10 transactions)
- `src/__tests__/parsers/mybank.test.ts` — test date parsing, amounts, payees, counterparty extraction

### 4. Test

```bash
npm test
npx tsx src/cli.ts import --file sample.csv --bank mybank --dry-run
```

## Tips

- If your bank exports in a non-UTF-8 encoding (e.g. CP1250), use `iconv-lite` to decode the Buffer before parsing. See `src/parsers/ing/index.ts` for an example.
- The `counterpartyAccount` field is what enables automatic transfer detection between your own accounts. Extract it when the CSV includes it.
- Dates must be normalized to `YYYY-MM-DD` format.
- Amounts must be signed numbers (negative for expenses).
