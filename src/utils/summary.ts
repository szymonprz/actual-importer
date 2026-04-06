export interface ImportSummary {
  imported: number;
  skipped: number;
  transfers: number;
  errors: string[];
}

export function createEmptySummary(): ImportSummary {
  return { imported: 0, skipped: 0, transfers: 0, errors: [] };
}

export function formatSummary(summary: ImportSummary, isDryRun: boolean): string {
  const prefix = isDryRun ? "[DRY RUN] " : "";
  const lines = [
    `${prefix}✔ Import complete`,
    `  Imported:   ${summary.imported} transactions`,
    `  Skipped:    ${summary.skipped}  (duplicates)`,
    `  Transfers:  ${summary.transfers}  (matched to own accounts)`,
    `  Errors:     ${summary.errors.length}`,
  ];

  if (summary.errors.length > 0) {
    lines.push("");
    for (const error of summary.errors) {
      lines.push(`  ✗ ${error}`);
    }
  }

  return lines.join("\n");
}
