/** Human-readable output for an import. */
import type { ImportOutcome } from "./execute.js";
import type { ImportPlan } from "./plan.js";

export function formatTransfers(
  plan: ImportPlan,
  accountNames: ReadonlyMap<string, string>
): string[] {
  return plan.items.flatMap(({ source, amount, action }) => {
    if (action.kind === "duplicate" || action.kind === "create") return [];
    const label = `${source.date}  ${(amount / 100).toFixed(2).padStart(10)}  → ${accountNames.get(action.target) ?? action.target}`;
    switch (action.kind) {
      case "adopt":
        return [`  ${label}  already in Actual (${action.existing.date}), marking as imported`];
      case "link":
        return [`  ${label}  link to existing (${action.counterpart.date})`];
      case "transfer":
        return [`  ${label}  new transfer`];
    }
  });
}

export function formatReport(
  transferLines: string[],
  outcome: ImportOutcome,
  dryRun: boolean
): string {
  const lines: string[] = [];
  if (transferLines.length > 0) {
    lines.push("Transfers:", ...transferLines, "");
  }
  lines.push(formatSummary(outcome, dryRun));
  return lines.join("\n");
}

export function formatSummary(outcome: ImportOutcome, dryRun: boolean): string {
  const prefix = dryRun ? "[DRY RUN] " : "";
  const lines = [
    `${prefix}✔ Import complete`,
    `  Imported:   ${outcome.imported} transactions`,
    `  Skipped:    ${outcome.skipped}  (duplicates)`,
    `  Transfers:  ${outcome.transfers}  (matched to own accounts)`,
    `  Errors:     ${outcome.errors.length}`,
  ];
  for (const [i, error] of outcome.errors.entries()) {
    if (i === 0) lines.push("");
    lines.push(`  ✗ ${error}`);
  }
  return lines.join("\n");
}

/** Machine-readable view of a plan's transactions (for --json). */
export function planToJson(
  plan: ImportPlan,
  accountNames: ReadonlyMap<string, string>
) {
  return plan.items.map(({ source, amount, importedId, action }) => ({
    date: source.date,
    amountCents: amount,
    payee: source.payee,
    description: source.description,
    importedId,
    action: action.kind,
    ...("target" in action
      ? { transferAccount: { id: action.target, name: accountNames.get(action.target) } }
      : {}),
    ...(action.kind === "link" ? { linkedTransactionId: action.counterpart.id } : {}),
    ...(action.kind === "adopt" ? { adoptedTransactionId: action.existing.id } : {}),
  }));
}
